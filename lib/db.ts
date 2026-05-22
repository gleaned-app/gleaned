import type { Entry, Attachment, EntryDraft, EntryUpdate, ReviewOutcome } from "@/types/entry";
import type { Todo } from "@/types/todo";
import { loadKey, encryptText, decryptText, encryptBytes, decryptBytes, bytesToBase64 } from "./crypto";
import { computeNextInterval } from "./review-scheduler";

type AnyDoc = Entry | Todo;

// Upper bound for metadata-only queries (IDs + dates, no enc blobs).
// A journal with 5 entries/day reaches this after ~2.7 years.
const QUERY_METADATA_LIMIT = 5000;
// Upper bound for queries that decrypt entry content.
const QUERY_DECRYPT_LIMIT = 2000;
// Max number of never-reviewed ("backfill") entries added to the review queue.
// Prevents overwhelming a new user who has many old entries without nextReview.
const REVIEW_BACKFILL_CAP = 20;

// ─── Search cache ─────────────────────────────────────────────────────────────
// All decrypted entries in memory so searchEntries never re-decrypts on each
// query. Cleared on lock, updated incrementally on save/update/delete.
let _searchCache: Entry[] | null = null;
function invalidateSearchCache() { _searchCache = null; }

function toLocalDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Type guards ─────────────────────────────────────────────────────────────
// Protects against corrupted DB documents instead of crashing the whole Promise.all

function isEntry(doc: unknown): doc is Entry {
  return (
    !!doc &&
    typeof doc === "object" &&
    (doc as Record<string, unknown>).type === "entry" &&
    typeof (doc as Record<string, unknown>)._id === "string"
  );
}

// ─── Sync status ─────────────────────────────────────────────────────────────

export type SyncStatus = "idle" | "syncing" | "synced" | "error";

let _syncStatus: SyncStatus = "idle";
let _syncHandler: PouchDB.Replication.Sync<AnyDoc> | null = null;
const _syncListeners = new Set<(s: SyncStatus) => void>();

function setSyncStatus(s: SyncStatus) {
  _syncStatus = s;
  _syncListeners.forEach((l) => l(s));
}

export function getSyncStatus(): SyncStatus { return _syncStatus; }

export function subscribeSyncStatus(cb: (s: SyncStatus) => void): () => void {
  _syncListeners.add(cb);
  return () => _syncListeners.delete(cb);
}

export function stopSync() {
  _syncHandler?.cancel();
  _syncHandler = null;
  setSyncStatus("idle");
}

export async function startSync(url: string, username?: string, password?: string) {
  stopSync();
  const trimmed = url.trim();
  if (!trimmed) return;

  let syncUrl = trimmed;
  if (username?.trim()) {
    try {
      const parsed = new URL(trimmed);
      parsed.username = encodeURIComponent(username.trim());
      parsed.password = encodeURIComponent(password?.trim() ?? "");
      syncUrl = parsed.toString();
    } catch { /* invalid URL — use as-is */ }
  }

  const db = await getDB();
  setSyncStatus("syncing");
  _syncHandler = db
    .sync(syncUrl, { live: true, retry: true })
    .on("active",  () => setSyncStatus("syncing"))
    .on("paused",  (err) => setSyncStatus(err ? "error" : "synced"))
    .on("error",   () => setSyncStatus("error"))
    .on("denied",  () => setSyncStatus("error")) as PouchDB.Replication.Sync<AnyDoc>;
}

// ─── Auth guard ──────────────────────────────────────────────────────────────
// auth.ts calls setDbAuthenticated on every login/logout so all data functions
// throw when accessed unauthenticated (e.g. from the browser console). No
// circular import: auth.ts already imports db.ts; db.ts never imports auth.ts.

// Three-state guard:
//   "pending"       — initial state and after HMR module reset; requireAuth passes
//                     because no DB-using component is mounted before auth completes.
//   "authenticated" — set by auth.ts after successful login / setupPassword.
//   "locked"        — set by auth.ts on logout; requireAuth throws to block console access.
// Using "pending" instead of a boolean means an HMR reset of this module never
// produces false-positives: the page was already behind the LockScreen at the
// time of the reset, so no DB calls reach requireAuth until login runs again.
type DbAuthState = "pending" | "authenticated" | "locked";
let _dbAuthState: DbAuthState = "pending";

export function setDbAuthenticated(authenticated: boolean): void {
  _dbAuthState = authenticated ? "authenticated" : "locked";
  if (!authenticated) invalidateSearchCache();
  if (authenticated) {
    migrateTodosEncryption().catch(() => {});
    migrateAttachmentsToNative().catch(() => {});
  }
}

function requireAuth(): void {
  if (_dbAuthState === "locked") throw new Error("gleaned: not authenticated");
}


// ─── DB init ─────────────────────────────────────────────────────────────────

let _db: PouchDB.Database<AnyDoc> | null = null;

export async function getDB(): Promise<PouchDB.Database<AnyDoc>> {
  if (_db) return _db;

  const PouchDB = (await import("pouchdb")).default;
  const PouchDBFind = (await import("pouchdb-find")).default;
  PouchDB.plugin(PouchDBFind);

  _db = new PouchDB<AnyDoc>("gleaned");
  // pouchdb 9's isRemote() warns whenever typeof db.type === 'function'.
  // The IDB adapter assigns api.type = function(){...} asynchronously after construction,
  // so a plain value override gets clobbered. A getter/setter trap keeps type non-function
  // and swallows the adapter's assignment; isRemote() falls through to return false (= local).
  Object.defineProperty(_db, "type", { get: () => undefined, set: () => {}, configurable: true });
  await Promise.all([
    _db.createIndex({ index: { fields: ["type", "date", "createdAt"] } }),
    _db.createIndex({ index: { fields: ["type", "createdAt"] } }),
    _db.createIndex({ index: { fields: ["type", "nextReview"] } }),
  ]);

  return _db;
}

// ─── Tags ────────────────────────────────────────────────────────────────────

export async function getStreakData(): Promise<{ streak: number; todayCount: number; longestStreak: number }> {
  requireAuth();
  const db = await getDB();
  const today = toLocalDateStr();
  const result = await db.find({ selector: { type: "entry" }, fields: ["date"] });
  const dates = new Set(result.docs.map((d) => (d as Entry).date));
  const todayCount = result.docs.filter((d) => (d as Entry).date === today).length;

  // Current streak — walk backwards from today (or yesterday if no entry yet today)
  let streak = 0;
  const cursor = new Date();
  if (!dates.has(today)) cursor.setDate(cursor.getDate() - 1);
  while (true) {
    const ds = toLocalDateStr(cursor);
    if (!dates.has(ds)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Longest streak ever — walk all entry dates in order
  const sorted = [...dates].sort();
  let longestStreak = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const ds of sorted) {
    const d = new Date(ds + "T00:00:00");
    if (prev) {
      const gap = Math.round((d.getTime() - prev.getTime()) / 86_400_000);
      run = gap === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    if (run > longestStreak) longestStreak = run;
    prev = d;
  }

  return { streak, todayCount, longestStreak };
}

export async function getAllTags(): Promise<Map<string, number>> {
  requireAuth();
  const all = _searchCache ?? await buildSearchCache();
  const counts = new Map<string, number>();
  for (const doc of all) {
    for (const tag of doc.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return counts;
}

export async function getEntriesByTag(tag: string): Promise<Entry[]> {
  requireAuth();
  const db = await getDB();
  const result = await db.find({
    selector: { type: "entry" },
    sort: [{ type: "asc" }, { createdAt: "asc" }],
  });
  const decrypted = await Promise.all((result.docs as Entry[]).map(decryptEntry));
  return decrypted.filter((e) => e.tags?.includes(tag));
}

export async function deleteTag(tag: string): Promise<void> {
  requireAuth();
  const db = await getDB();
  const result = await db.find({ selector: { type: "entry" } });
  for (const raw of result.docs as Entry[]) {
    const doc = await decryptEntry(raw);
    if (!doc.tags?.includes(tag)) continue;
    const newTags = doc.tags.filter((t) => t !== tag);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const latest = (await db.get(doc._id)) as unknown as Entry & { _attachments?: Record<string, unknown> };
        const attMeta = doc.attachments?.map(({ id, name, mimeType, size }) => ({ id, name, mimeType, size }));
        const base: Omit<Entry, "_rev" | "encrypted" | "enc"> = {
          _id: latest._id, type: "entry",
          content: doc.content, tags: newTags,
          date: latest.date, createdAt: latest.createdAt,
          ...(latest.nextReview        !== undefined ? { nextReview:        latest.nextReview        } : {}),
          ...(latest.reviewInterval    !== undefined ? { reviewInterval:    latest.reviewInterval    } : {}),
          ...(attMeta?.length ? { attachments: attMeta } : {}),
          // v2 unencrypted metadata from the raw DB doc
          ...(latest.entryType         !== undefined ? { entryType:         latest.entryType         } : {}),
          ...(latest.gapStatus         !== undefined ? { gapStatus:         latest.gapStatus         } : {}),
          ...(latest.lastReviewOutcome !== undefined ? { lastReviewOutcome: latest.lastReviewOutcome } : {}),
          // v2 encrypted content from the decrypted doc
          ...(doc.source !== undefined ? { source: doc.source } : {}),
          ...(doc.stake  !== undefined ? { stake:  doc.stake  } : {}),
          ...(doc.gap    !== undefined ? { gap:    doc.gap    } : {}),
        };
        const enc = await encryptEntry(base);
        await db.put({
          ...enc,
          _rev: latest._rev,
          ...(latest._attachments ? { _attachments: latest._attachments } : {}),
        } as unknown as AnyDoc);
        break;
      } catch (err) {
        if ((err as { status?: number }).status !== 409) throw err;
      }
    }
  }
  invalidateSearchCache();
}

// ─── Entry encryption helpers ────────────────────────────────────────────────

// Only attachment metadata (no binary data) goes into the encrypted JSON payload.
// The actual binary data is stored as a separate encrypted PouchDB _attachment.
interface AttachmentMeta {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

interface EncPayload {
  content: string;
  tags: string[];
  attachments?: AttachmentMeta[];
  // v2: personal content fields encrypted alongside content
  source?: string;
  stake?: string;
  gap?: string;
}

type PouchAttachmentInline = { content_type: string; data: string };
type PouchAttachmentStub   = { content_type: string; stub: true; digest?: string; length?: number; revpos?: number };
type PouchAttachments = Record<string, PouchAttachmentInline | PouchAttachmentStub>;

/* @internal — exported for unit tests only */
export async function encryptEntry(
  doc: Omit<Entry, "_rev" | "encrypted" | "enc">,
): Promise<Omit<Entry, "_rev">> {
  const key = await loadKey();
  if (!key) return doc;

  const attMeta: AttachmentMeta[] | undefined = doc.attachments?.map(
    ({ id, name, mimeType, size }) => ({ id, name, mimeType, size }),
  );
  const payload: EncPayload = {
    content: doc.content,
    tags: doc.tags,
    ...(attMeta?.length ? { attachments: attMeta } : {}),
    // v2 personal content: encrypted alongside body content
    ...(doc.source !== undefined ? { source: doc.source } : {}),
    ...(doc.stake  !== undefined ? { stake:  doc.stake  } : {}),
    ...(doc.gap    !== undefined ? { gap:    doc.gap    } : {}),
  };
  const enc = await encryptText(key, JSON.stringify(payload));

  // Encrypt attachment binaries and attach them inline to the document.
  // Only attachments that carry fresh data (att.data is set) are encrypted here;
  // existing attachments without data are preserved via stubs in the put call.
  const pouchAtts: PouchAttachments = {};
  for (const att of doc.attachments ?? []) {
    if (!att.data) continue;
    const comma = att.data.indexOf(",");
    const rawBase64 = comma !== -1 ? att.data.slice(comma + 1) : att.data;
    const bytes = Uint8Array.from(atob(rawBase64), (c) => c.charCodeAt(0));
    pouchAtts[att.id] = {
      content_type: "application/octet-stream",
      data: await encryptBytes(key, bytes.buffer as ArrayBuffer),
    };
  }

  return {
    _id: doc._id, type: "entry", date: doc.date, createdAt: doc.createdAt,
    content: "", tags: [], encrypted: true, enc,
    ...(doc.nextReview !== undefined ? { nextReview: doc.nextReview } : {}),
    ...(doc.reviewInterval !== undefined ? { reviewInterval: doc.reviewInterval } : {}),
    // v2 unencrypted metadata — preserved in DB for scheduling/filtering without decryption
    ...(doc.entryType         !== undefined ? { entryType:         doc.entryType         } : {}),
    ...(doc.gapStatus         !== undefined ? { gapStatus:         doc.gapStatus         } : {}),
    ...(doc.lastReviewOutcome !== undefined ? { lastReviewOutcome: doc.lastReviewOutcome } : {}),
    ...(Object.keys(pouchAtts).length ? { _attachments: pouchAtts } : {}),
  } as unknown as Omit<Entry, "_rev">;
}

/* @internal — exported for unit tests only */
export async function decryptEntry(entry: Entry): Promise<Entry> {
  if (!entry.encrypted || !entry.enc) return entry;
  const key = await loadKey();
  if (!key) return entry;
  try {
    const payload = JSON.parse(await decryptText(key, entry.enc)) as EncPayload;
    const rawAtts = (entry as unknown as { _attachments?: Record<string, { data?: string }> })._attachments;

    let attachments: Attachment[] | undefined;
    if (payload.attachments?.length) {
      attachments = await Promise.all(
        payload.attachments.map(async (meta): Promise<Attachment> => {
          const encB64 = rawAtts?.[meta.id]?.data;
          if (encB64) {
            const plain = await decryptBytes(key, encB64);
            const data = `data:${meta.mimeType};base64,${bytesToBase64(new Uint8Array(plain))}`;
            return { ...meta, data };
          }
          return meta;
        }),
      );
    }

    return {
      ...entry,
      content: payload.content,
      tags: payload.tags,
      ...(attachments?.length ? { attachments } : {}),
      // v2 personal content — restored from payload; omit key entirely when absent
      // so downstream code can use `field !== undefined` safely
      ...(payload.source !== undefined ? { source: payload.source } : {}),
      ...(payload.stake  !== undefined ? { stake:  payload.stake  } : {}),
      ...(payload.gap    !== undefined ? { gap:    payload.gap    } : {}),
    };
  } catch {
    return entry;
  }
}

// ─── Todo encryption helpers ─────────────────────────────────────────────────

/* @internal — exported for unit tests only, not part of the public db API */
export async function encryptTodo(
  doc: Omit<Todo, "_rev" | "encrypted" | "textEnc">,
): Promise<Omit<Todo, "_rev">> {
  const key = await loadKey();
  if (!key) return doc;
  const textEnc = await encryptText(key, doc.text);
  return {
    _id: doc._id, type: "todo",
    text: "", done: doc.done, createdAt: doc.createdAt,
    encrypted: true, textEnc,
    ...(doc.dueDate ? { dueDate: doc.dueDate } : {}),
    ...(doc.color  ? { color:  doc.color  } : {}),
  };
}

/* @internal */ export async function decryptTodo(todo: Todo): Promise<Todo> {
  if (!todo.encrypted || !todo.textEnc) return todo;
  const key = await loadKey();
  if (!key) return todo;
  try {
    return { ...todo, text: await decryptText(key, todo.textEnc) };
  } catch {
    return todo;
  }
}

// Strips plaintext from a decrypted todo before writing back to the DB.
// Needed when non-text fields (done/dueDate/color) are updated: the in-memory
// todo has both the decrypted text and the enc fields; we must not persist the
// plaintext alongside the ciphertext.
/* @internal */ export function withoutPlaintext(todo: Todo): Todo {
  return todo.encrypted ? { ...todo, text: "" } : todo;
}

// One-shot migration: re-encrypts any todos that were created before encryption
// was added. Runs fire-and-forget in the background after every login.
async function migrateTodosEncryption(): Promise<void> {
  const key = await loadKey();
  if (!key) return;
  const db = await getDB();
  const result = await db.find({ selector: { type: "todo" } });
  const plain = (result.docs as Todo[]).filter((t) => !t.encrypted && t.text);
  for (const todo of plain) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const latest = attempt === 0 ? todo : (await db.get(todo._id)) as unknown as Todo;
        if ((latest as { encrypted?: boolean }).encrypted) break;
        const base: Omit<Todo, "_rev" | "encrypted" | "textEnc"> = {
          _id: latest._id, type: "todo",
          text: latest.text, done: latest.done, createdAt: latest.createdAt,
          ...(latest.dueDate ? { dueDate: latest.dueDate } : {}),
          ...(latest.color  ? { color:  latest.color  } : {}),
        };
        const enc = await encryptTodo(base);
        await db.put({ ...enc, _rev: latest._rev } as unknown as AnyDoc);
        break;
      } catch (err) {
        if ((err as { status?: number }).status !== 409) break;
      }
    }
  }
}

// ─── Entries ────────────────────────────────────────────────────────────────

export async function saveEntry(draft: EntryDraft): Promise<Entry> {
  requireAuth();
  const db = await getDB();
  const { content, tags, attachments, entryType, source, stake, gap } = draft;
  // Auto-default gapStatus to "open" when a gap is provided without an explicit status
  const gapStatus = draft.gapStatus ?? (gap ? "open" : undefined);
  const now = new Date();
  const tomorrow = toLocalDateStr(new Date(now.getTime() + 86_400_000));
  const base: Omit<Entry, "_rev" | "encrypted" | "enc"> = {
    _id: `entry_${now.getTime()}_${Math.random().toString(36).slice(2, 7)}`,
    type: "entry",
    content,
    tags,
    date: toLocalDateStr(now),
    createdAt: now.toISOString(),
    nextReview: tomorrow,
    reviewInterval: 1,
    ...(attachments?.length ? { attachments } : {}),
    ...(entryType !== undefined ? { entryType } : {}),
    ...(source    !== undefined ? { source    } : {}),
    ...(stake     !== undefined ? { stake     } : {}),
    ...(gap       !== undefined ? { gap       } : {}),
    ...(gapStatus !== undefined ? { gapStatus } : {}),
  };
  const doc = await encryptEntry(base);
  await db.put(doc as unknown as AnyDoc);
  // Return in-memory entry with decrypted fields so the caller can display immediately
  const saved: Entry = {
    ...doc, content, tags,
    ...(attachments?.length ? { attachments } : {}),
    ...(source !== undefined ? { source } : {}),
    ...(stake  !== undefined ? { stake  } : {}),
    ...(gap    !== undefined ? { gap    } : {}),
  } as Entry;
  if (_searchCache !== null) _searchCache = [saved, ..._searchCache];
  return saved;
}

export async function getEntriesByDate(date: string): Promise<Entry[]> {
  requireAuth();
  const db = await getDB();
  // Pass 1: fetch only metadata so we can sort without loading enc blobs
  const meta = await db.find({
    selector: { type: "entry", date },
    fields: ["_id", "createdAt"],
    sort: [{ type: "asc" }, { date: "asc" }, { createdAt: "asc" }],
  });
  const ids = (meta.docs as { _id: string; createdAt: string }[])
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((d) => d._id);
  if (ids.length === 0) return [];
  // Pass 2: batch fetch with attachment data so decryptEntry can reconstruct data URLs
  const res = await db.allDocs({ keys: ids, include_docs: true, attachments: true } as Parameters<typeof db.allDocs>[0]);
  const docs = (res.rows.map((r) => ("doc" in r ? r.doc : null)) as unknown[]).filter(isEntry);
  return Promise.all(docs.map(decryptEntry));
}

export async function getEntryMonths(): Promise<string[]> {
  requireAuth();
  const db = await getDB();
  const result = await db.find({ selector: { type: "entry" }, fields: ["date"], limit: QUERY_METADATA_LIMIT });
  const months = new Set<string>();
  for (const doc of result.docs as { date?: string }[]) {
    if (doc.date) months.add(doc.date.slice(0, 7));
  }
  return Array.from(months).sort().reverse();
}

export async function getEntriesForMonth(year: number, month: number): Promise<Entry[]> {
  requireAuth();
  const db = await getDB();
  const pad = (n: number) => String(n).padStart(2, "0");
  const prefix = `${year}-${pad(month + 1)}`;
  const result = await db.find({
    selector: { type: "entry", date: { $gte: `${prefix}-01`, $lte: `${prefix}-31` } },
    sort: [{ type: "asc" }, { date: "asc" }, { createdAt: "asc" }],
    limit: 1000,
  });
  return Promise.all((result.docs as unknown[]).filter(isEntry).map(decryptEntry));
}

export async function getEntryCountsByDate(): Promise<Map<string, number>> {
  requireAuth();
  const db = await getDB();
  const result = await db.find({ selector: { type: "entry" }, fields: ["date"] });
  const counts = new Map<string, number>();
  for (const doc of result.docs as Entry[]) {
    const d = doc.date;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return counts;
}

async function buildSearchCache(): Promise<Entry[]> {
  const db = await getDB();
  const result = await db.find({ selector: { type: "entry" }, limit: QUERY_DECRYPT_LIMIT });
  const decrypted = await Promise.all((result.docs as unknown[]).filter(isEntry).map(decryptEntry));
  _searchCache = decrypted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return _searchCache;
}

export async function searchEntries(query: string): Promise<Entry[]> {
  requireAuth();
  const q = query.toLowerCase();
  const all = _searchCache ?? await buildSearchCache();
  return all
    .filter((e) =>
      e.content?.toLowerCase().includes(q) ||
      e.tags?.some((t) => t.toLowerCase().includes(q))
    )
    .slice(0, 20);
}

export async function updateEntry(entry: Entry, update: EntryUpdate): Promise<Entry> {
  requireAuth();
  const db = await getDB();
  const { content, tags } = update;
  // Merge update with existing entry: undefined in update → keep current value from entry.
  // Callers that only touch content/tags never accidentally clear v2 fields.
  const source    = update.source    !== undefined ? update.source    : entry.source;
  const stake     = update.stake     !== undefined ? update.stake     : entry.stake;
  const gap       = update.gap       !== undefined ? update.gap       : entry.gap;
  // Auto-default gapStatus to "open" when gap is first introduced without an explicit status
  const gapStatus = update.gapStatus !== undefined
    ? update.gapStatus
    : (entry.gapStatus ?? (gap ? "open" : undefined));
  const entryType = update.entryType !== undefined ? update.entryType : entry.entryType;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      // Always fetch fresh — needed for the correct _rev and for _attachments stubs
      // that preserve existing PouchDB native attachment binaries on re-put.
      const latest = (await db.get(entry._id)) as unknown as Entry & { _attachments?: Record<string, unknown> };
      // Pass metadata only (no data) so encryptEntry skips binary re-encryption
      // while still writing the correct attachment metadata into the enc payload.
      const attMeta = entry.attachments?.map(({ id, name, mimeType, size }) => ({ id, name, mimeType, size }));
      const base: Omit<Entry, "_rev" | "encrypted" | "enc"> = {
        _id: latest._id, type: "entry",
        content, tags, date: latest.date, createdAt: latest.createdAt,
        ...(latest.nextReview     !== undefined ? { nextReview:     latest.nextReview     } : {}),
        ...(latest.reviewInterval !== undefined ? { reviewInterval: latest.reviewInterval } : {}),
        ...(attMeta?.length ? { attachments: attMeta } : {}),
        // v2 unencrypted metadata — latest from DB takes precedence for outcome; others from merge
        ...(latest.lastReviewOutcome !== undefined ? { lastReviewOutcome: latest.lastReviewOutcome } : {}),
        ...(entryType !== undefined ? { entryType } : {}),
        ...(gapStatus !== undefined ? { gapStatus } : {}),
        // v2 encrypted content — merged values
        ...(source !== undefined ? { source } : {}),
        ...(stake  !== undefined ? { stake  } : {}),
        ...(gap    !== undefined ? { gap    } : {}),
      };
      const enc = await encryptEntry(base);
      const res = await db.put({
        ...enc,
        _rev: latest._rev,
        ...(latest._attachments ? { _attachments: latest._attachments } : {}),
      } as unknown as AnyDoc);
      const updated: Entry = {
        ...enc, _rev: res.rev, content, tags,
        ...(entry.attachments?.length ? { attachments: entry.attachments } : {}),
        ...(source !== undefined ? { source } : {}),
        ...(stake  !== undefined ? { stake  } : {}),
        ...(gap    !== undefined ? { gap    } : {}),
      } as Entry;
      if (_searchCache !== null) {
        _searchCache = _searchCache.map((e) => e._id === updated._id ? updated : e);
      }
      return updated;
    } catch (err) {
      if ((err as { status?: number }).status !== 409) throw err;
    }
  }
  throw new Error("gleaned: too many conflicts updating entry");
}

export async function deleteEntry(id: string): Promise<void> {
  requireAuth();
  const db = await getDB();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const doc = await db.get(id);
      await db.remove(doc);
      if (_searchCache !== null) _searchCache = _searchCache.filter((e) => e._id !== id);
      return;
    } catch (err) {
      if ((err as { status?: number }).status === 404) return;
      if ((err as { status?: number }).status !== 409) throw err;
    }
  }
  throw new Error("gleaned: too many conflicts deleting entry");
}

// ─── Todos ───────────────────────────────────────────────────────────────────

export async function saveTodo(text: string, dueDate?: string, color?: string): Promise<Todo> {
  requireAuth();
  const db = await getDB();
  const now = new Date();
  const base: Omit<Todo, "_rev" | "encrypted" | "textEnc"> = {
    _id: `todo_${now.getTime()}_${Math.random().toString(36).slice(2, 7)}`,
    type: "todo",
    text,
    done: false,
    createdAt: now.toISOString(),
    ...(dueDate ? { dueDate } : {}),
    ...(color ? { color } : {}),
  };
  const doc = await encryptTodo(base);
  await db.put(doc as unknown as AnyDoc);
  return { ...doc, text } as Todo;
}

export async function getTodos(): Promise<Todo[]> {
  requireAuth();
  const db = await getDB();
  const result = await db.find({
    selector: { type: "todo" },
    sort: [{ type: "asc" }, { createdAt: "asc" }],
  });
  return Promise.all((result.docs as Todo[]).map(decryptTodo));
}

export async function updateTodoDoc(todo: Todo): Promise<Todo> {
  requireAuth();
  const db = await getDB();
  const targetDone = !todo.done;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const latest = attempt === 0 ? todo : (await db.get(todo._id)) as unknown as Todo;
      const updated = { ...withoutPlaintext(latest), done: targetDone };
      const res = await db.put(updated as unknown as AnyDoc);
      return { ...updated, _rev: res.rev, text: todo.text } as Todo;
    } catch (err) {
      if ((err as { status?: number }).status !== 409) throw err;
    }
  }
  throw new Error("gleaned: too many conflicts updating todo");
}

export async function updateTodoDueDate(todo: Todo, dueDate: string | undefined): Promise<Todo> {
  requireAuth();
  const db = await getDB();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const latest = attempt === 0 ? todo : (await db.get(todo._id)) as unknown as Todo;
      const updated: Todo = { ...withoutPlaintext(latest) };
      if (dueDate) updated.dueDate = dueDate;
      else delete updated.dueDate;
      const res = await db.put(updated as unknown as AnyDoc);
      return { ...updated, _rev: res.rev, text: todo.text } as Todo;
    } catch (err) {
      if ((err as { status?: number }).status !== 409) throw err;
    }
  }
  throw new Error("gleaned: too many conflicts updating todo dueDate");
}

export async function updateTodoColor(todo: Todo, color: string | undefined): Promise<Todo> {
  requireAuth();
  const db = await getDB();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const latest = attempt === 0 ? todo : (await db.get(todo._id)) as unknown as Todo;
      const updated: Todo = { ...withoutPlaintext(latest) };
      if (color) updated.color = color;
      else delete updated.color;
      const res = await db.put(updated as unknown as AnyDoc);
      return { ...updated, _rev: res.rev, text: todo.text } as Todo;
    } catch (err) {
      if ((err as { status?: number }).status !== 409) throw err;
    }
  }
  throw new Error("gleaned: too many conflicts updating todo color");
}

export async function updateTodoText(todo: Todo, text: string): Promise<Todo> {
  requireAuth();
  const db = await getDB();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const latest = attempt === 0 ? todo : (await db.get(todo._id)) as unknown as Todo;
      const base: Omit<Todo, "_rev" | "encrypted" | "textEnc"> = {
        _id: latest._id, type: "todo",
        text, done: latest.done, createdAt: latest.createdAt,
        ...(latest.dueDate ? { dueDate: latest.dueDate } : {}),
        ...(latest.color  ? { color:  latest.color  } : {}),
      };
      const enc = await encryptTodo(base);
      const res = await db.put({ ...enc, _rev: latest._rev } as unknown as AnyDoc);
      return { ...enc, _rev: res.rev, text } as Todo;
    } catch (err) {
      if ((err as { status?: number }).status !== 409) throw err;
    }
  }
  throw new Error("gleaned: too many conflicts updating todo text");
}

export async function deleteTodo(id: string): Promise<void> {
  requireAuth();
  const db = await getDB();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const doc = await db.get(id);
      await db.remove(doc);
      return;
    } catch (err) {
      if ((err as { status?: number }).status === 404) return;
      if ((err as { status?: number }).status !== 409) throw err;
    }
  }
  throw new Error("gleaned: too many conflicts deleting todo");
}

// ─── Review (spaced repetition + history) ────────────────────────────────────

export async function getRecentEntries(limit = 50): Promise<Entry[]> {
  requireAuth();
  const db = await getDB();
  // Pass 1: fetch only metadata (no enc blob) to sort and slice
  const result = await db.find({
    selector: { type: "entry" },
    fields: ["_id", "createdAt"],
    limit: QUERY_METADATA_LIMIT,
  });
  const ids = (result.docs as unknown as Pick<Entry, "_id" | "createdAt">[])
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map((e) => e._id);
  if (ids.length === 0) return [];
  // Pass 2: single batch request for all needed docs, then decrypt
  const res = await db.allDocs({ keys: ids, include_docs: true });
  const docs = (res.rows.map((r) => ("doc" in r ? r.doc : null)) as unknown[]).filter(isEntry);
  return Promise.all(docs.map(decryptEntry));
}

export async function getReviewDue(): Promise<Entry[]> {
  requireAuth();
  const db = await getDB();
  const today = toLocalDateStr();

  // Pass 1: metadata only — filter without loading enc blobs
  const result = await db.find({
    selector: { type: "entry" },
    fields: ["_id", "date", "createdAt", "nextReview"],
    limit: QUERY_METADATA_LIMIT,
  });
  const all = result.docs as unknown as Pick<Entry, "_id" | "date" | "createdAt" | "nextReview">[];

  // All entries whose scheduled review date has arrived or passed
  const scheduledIds = all
    .filter((e) => e.nextReview && e.nextReview <= today)
    .map((e) => e._id);

  // Oldest entries that have never been reviewed (pre-feature data), capped so a
  // new user is not flooded with their entire history on first use
  const backfillIds = all
    .filter((e) => !e.nextReview && e.date < today)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, REVIEW_BACKFILL_CAP)
    .map((e) => e._id);

  const ids = [...scheduledIds, ...backfillIds];
  if (ids.length === 0) return [];
  // Pass 2: single batch request, then decrypt only what we need
  const res = await db.allDocs({ keys: ids, include_docs: true });
  const docs = (res.rows.map((r) => ("doc" in r ? r.doc : null)) as unknown[]).filter(isEntry);
  return Promise.all(docs.map(decryptEntry));
}

export async function getReviewCount(): Promise<number> {
  requireAuth();
  const db = await getDB();
  const today = toLocalDateStr();

  const result = await db.find({
    selector: { type: "entry" },
    fields: ["_id", "nextReview", "date"],
    limit: QUERY_METADATA_LIMIT,
  });
  const all = result.docs as unknown as Pick<Entry, "_id" | "nextReview" | "date">[];

  const scheduled = all.filter((e) => e.nextReview && e.nextReview <= today).length;
  const backfill  = Math.min(all.filter((e) => !e.nextReview && e.date < today).length, REVIEW_BACKFILL_CAP);
  return scheduled + backfill;
}

export async function markReviewed(entry: Entry, outcome: ReviewOutcome): Promise<Entry> {
  requireAuth();
  const db = await getDB();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const latest = (await db.get(entry._id)) as unknown as Entry & { _attachments?: Record<string, unknown> };
      const currentInterval = latest.reviewInterval ?? 1;
      const hasOpenGap = latest.gapStatus === "open";
      const newInterval = computeNextInterval(currentInterval, outcome, hasOpenGap);
      const nextReview = toLocalDateStr(new Date(Date.now() + newInterval * 86_400_000));
      const updated = { ...latest, reviewInterval: newInterval, nextReview, lastReviewOutcome: outcome };
      const res = await db.put(updated as unknown as AnyDoc);
      return { ...updated, _rev: res.rev };
    } catch (err) {
      if ((err as { status?: number }).status !== 409) throw err;
    }
  }
  throw new Error("gleaned: too many conflicts updating review");
}

// ─── Settings ────────────────────────────────────────────────────────────────

export interface Settings {
  _id: "gleaned_settings";
  _rev?: string;
  type: "settings";
  encryptionSalt?: string;
  encryptionVerification?: string;
  language?: "de" | "en";
  weekStart?: "monday" | "sunday";
  theme?: "system" | "light" | "dark" | "sepia";
  bodyFont?: "sans" | "serif" | "playfair" | "handwriting";
  couchdbUrl?: string;
  couchdbUsername?: string;
  couchdbPassword?: string;    // never stored — ephemeral, only returned by getSettings
  couchdbPasswordEnc?: string; // AES-GCM ciphertext stored in DB
  defaultView?: "journal" | "calendar" | "todos" | "review";
  migratedAttachmentsV2?: boolean; // set after one-shot native-attachment migration
}

// ─── Conflicts ───────────────────────────────────────────────────────────────

export interface ConflictDoc {
  winner: Entry;
  alternatives: Entry[];
}

export async function getConflicts(): Promise<ConflictDoc[]> {
  requireAuth();
  const db = await getDB();
  const result = await db.allDocs({
    include_docs: true,
    conflicts: true,
    startkey: "entry_",
    endkey: "entry_￿",
  });

  type WithConflicts = Entry & { _conflicts?: string[] };
  const conflicted = result.rows.filter((r) => {
    const doc = r.doc as unknown as WithConflicts | undefined;
    return doc && (doc._conflicts?.length ?? 0) > 0;
  });

  return Promise.all(
    conflicted.map(async (row) => {
      const winnerRaw = row.doc as unknown as WithConflicts;
      const winner = await decryptEntry(winnerRaw as Entry) as WithConflicts;
      const alternatives = (
        await Promise.allSettled(
          (winnerRaw._conflicts ?? []).map((rev) =>
            db.get(winnerRaw._id, { rev }) as Promise<Entry>
          )
        )
      )
        .filter((r): r is PromiseFulfilledResult<Entry> => r.status === "fulfilled")
        .map((r) => r.value);
      const decryptedAlts = await Promise.all(alternatives.map(decryptEntry));
      return { winner: winner as Entry, alternatives: decryptedAlts };
    })
  );
}

export async function resolveConflict(
  id: string,
  keepRev: string,
  discardRevs: string[]
): Promise<void> {
  requireAuth();
  const db = await getDB();
  const current = (await db.get(id)) as Entry & { _attachments?: Record<string, unknown> };

  if (current._rev !== keepRev) {
    // User chose an alternative — decrypt it and overwrite the winner
    const keepRaw = (await db.get(id, { rev: keepRev })) as Entry;
    const keep = await decryptEntry(keepRaw);
    const attMeta = keep.attachments?.map(({ id: aid, name, mimeType, size }) => ({ id: aid, name, mimeType, size }));
    const base: Omit<Entry, "_rev" | "encrypted" | "enc"> = {
      _id: id, type: "entry",
      content: keep.content, tags: keep.tags,
      date: keep.date, createdAt: keep.createdAt,
      ...(attMeta?.length ? { attachments: attMeta } : {}),
      // v2 fields — taken from the chosen revision (keep is fully decrypted)
      ...(keep.entryType         !== undefined ? { entryType:         keep.entryType         } : {}),
      ...(keep.gapStatus         !== undefined ? { gapStatus:         keep.gapStatus         } : {}),
      ...(keep.lastReviewOutcome !== undefined ? { lastReviewOutcome: keep.lastReviewOutcome } : {}),
      ...(keep.source !== undefined ? { source: keep.source } : {}),
      ...(keep.stake  !== undefined ? { stake:  keep.stake  } : {}),
      ...(keep.gap    !== undefined ? { gap:    keep.gap    } : {}),
    };
    const enc = await encryptEntry(base);
    await db.put({
      ...enc,
      _rev: current._rev,
      ...(current._attachments ? { _attachments: current._attachments } : {}),
    } as unknown as AnyDoc);
  }

  await Promise.allSettled(discardRevs.map((rev) => db.remove(id, rev)));
}

export async function getSettings(): Promise<Settings | null> {
  const db = await getDB();
  try {
    const raw = (await db.get("gleaned_settings")) as unknown as Settings;
    if (raw.couchdbPasswordEnc) {
      const key = await loadKey();
      if (key) {
        try {
          raw.couchdbPassword = await decryptText(key, raw.couchdbPasswordEnc);
        } catch { /* corrupted or wrong key — omit password */ }
      }
    }
    return raw;
  } catch {
    return null;
  }
}

export async function saveSettings(data: Partial<Settings>): Promise<void> {
  const db = await getDB();

  // Encrypt couchdbPassword before storing — never write plaintext to IndexedDB.
  const toStore: Partial<Settings> = { ...data };
  if ("couchdbPassword" in toStore) {
    const key = await loadKey();
    if (key && toStore.couchdbPassword) {
      toStore.couchdbPasswordEnc = await encryptText(key, toStore.couchdbPassword);
    }
    delete toStore.couchdbPassword;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      // Read the raw doc directly to avoid re-introducing the decrypted plaintext
      // password that getSettings() would surface. Destructure out any legacy
      // plaintext field before merging (one-time migration on next save).
      let rawExisting: Record<string, unknown> | undefined;
      try {
        rawExisting = (await db.get("gleaned_settings")) as unknown as Record<string, unknown>;
      } catch { /* not found — first save */ }

      const { couchdbPassword: _, ...safeExisting } = rawExisting ?? {};

      await db.put({
        _id: "gleaned_settings",
        type: "settings",
        ...safeExisting,
        ...toStore,
      } as unknown as AnyDoc);
      return;
    } catch (err) {
      if ((err as { status?: number }).status !== 409) throw err;
    }
  }
  throw new Error("gleaned: too many conflicts saving settings");
}

// ─── Export / Import ─────────────────────────────────────────────────────────

export async function exportData(): Promise<string> {
  requireAuth();
  const db = await getDB();
  // Load with attachments:true so decryptEntry can reconstruct attachment data URLs.
  const result = await db.allDocs({ include_docs: true, attachments: true } as Parameters<typeof db.allDocs>[0]);
  // Decrypt entries so the export is portable across devices and passwords.
  const docs = await Promise.all(
    result.rows
      .filter((r) => r.doc && (r.doc.type === "entry" || r.doc.type === "todo"))
      .map(async (r) => {
        const raw = r.doc as AnyDoc & { _rev?: string; encrypted?: boolean; enc?: string; textEnc?: string };
        const { _rev: _, _attachments: __, ...doc } = raw as typeof raw & { _attachments?: unknown };
        if (doc.type === "entry" && doc.encrypted) {
          const decrypted = await decryptEntry(doc as Entry);
          const { encrypted: _e, enc: _f, ...plain } = decrypted as Entry & { encrypted?: boolean; enc?: string };
          return plain;
        }
        if (doc.type === "todo" && doc.encrypted) {
          const decrypted = await decryptTodo(doc as Todo);
          const { encrypted: _e, textEnc: _f, ...plain } = decrypted as Todo & { encrypted?: boolean; textEnc?: string };
          return plain;
        }
        return doc;
      })
  );
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), docs }, null, 2);
}

export async function importData(json: string): Promise<{ imported: number; skipped: number }> {
  requireAuth();
  const db = await getDB();
  const parsed = JSON.parse(json) as { docs?: unknown[] } | unknown[];
  const rawDocs: unknown[] = Array.isArray(parsed) ? parsed : ((parsed as { docs?: unknown[] }).docs ?? []);

  let imported = 0;
  let skipped = 0;

  // Allow only IDs that match gleaned's own generation pattern.
  // Blocks _design/*, _local/*, gleaned_settings, and any other internal docs.
  const VALID_ID = /^(entry|todo)_\d+_[a-z0-9]+$/;
  const IMPORTABLE_TYPES = new Set(["entry", "todo"]);
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  for (const raw of rawDocs) {
    const doc = raw as Record<string, unknown>;
    const id = doc._id as string;
    const type = doc.type as string;
    if (!id || !type || !IMPORTABLE_TYPES.has(type) || !VALID_ID.test(id)) { skipped++; continue; }

    // Skip entries that are still encrypted — they cannot be decrypted without the
    // original password and would import as blank entries.
    if (doc.encrypted === true) { skipped++; continue; }

    if (type === "entry") {
      const valid =
        typeof doc.content === "string" &&
        Array.isArray(doc.tags) &&
        (doc.tags as unknown[]).every((t) => typeof t === "string") &&
        typeof doc.date === "string" && DATE_RE.test(doc.date) &&
        typeof doc.createdAt === "string" && !isNaN(Date.parse(doc.createdAt as string));
      if (!valid) { skipped++; continue; }
    }

    if (type === "todo") {
      const valid =
        typeof doc.text === "string" &&
        typeof doc.done === "boolean" &&
        typeof doc.createdAt === "string" && !isNaN(Date.parse(doc.createdAt as string)) &&
        (doc.dueDate === undefined ||
          (typeof doc.dueDate === "string" && DATE_RE.test(doc.dueDate)));
      if (!valid) { skipped++; continue; }
    }

    try {
      await db.get(id);
      skipped++;
    } catch (e) {
      if ((e as { status?: number }).status === 404) {
        if (type === "entry") {
          // Re-encrypt under the current key so imported entries are not stored
          // in plaintext alongside encrypted native entries. encryptEntry is a
          // no-op when no key is loaded (password-less install).
          const mutable = { ...(doc as Record<string, unknown>) };
          delete mutable._rev;
          delete mutable.encrypted;
          delete mutable.enc;
          // Backfill missing attachment IDs from exports created before migration
          if (Array.isArray(mutable.attachments)) {
            mutable.attachments = (mutable.attachments as Attachment[]).map(
              (att) => att.id ? att : { ...att, id: Math.random().toString(36).slice(2, 10) },
            );
          }
          const toStore = await encryptEntry(mutable as Omit<Entry, "_rev" | "encrypted" | "enc">);
          await db.put(toStore as unknown as AnyDoc);
        } else {
          // Re-encrypt under the current key — same rationale as entries.
          const mutable = { ...(doc as Record<string, unknown>) };
          delete mutable._rev;
          delete mutable.encrypted;
          delete mutable.textEnc;
          const toStore = await encryptTodo(mutable as Omit<Todo, "_rev" | "encrypted" | "textEnc">);
          await db.put(toStore as unknown as AnyDoc);
        }
        imported++;
      } else {
        skipped++;
      }
    }
  }

  return { imported, skipped };
}

// ─── One-shot migration: base64-in-enc → PouchDB native attachments ──────────
// Runs fire-and-forget after every login but exits immediately once the settings
// flag is set, so the only cost after first run is one getSettings() call.

async function migrateAttachmentsToNative(): Promise<void> {
  const settings = await getSettings();
  if (settings?.migratedAttachmentsV2) return;

  const key = await loadKey();
  if (!key) return;
  const db = await getDB();

  const result = await db.find({ selector: { type: "entry" } });
  for (const raw of result.docs as Entry[]) {
    if (!raw.encrypted || !raw.enc) continue;

    let payload: EncPayload;
    try {
      payload = JSON.parse(await decryptText(key, raw.enc)) as EncPayload;
    } catch { continue; }

    // An attachment in the old format has a `data` field in the enc payload.
    const legacyAtts = (payload.attachments ?? []).filter(
      (a) => typeof (a as unknown as { data?: string }).data === "string",
    );
    if (legacyAtts.length === 0) continue;

    const newMeta: AttachmentMeta[] = [];
    const pouchAtts: PouchAttachments = {};

    for (const att of payload.attachments ?? []) {
      const legacyData = (att as unknown as { data?: string }).data;
      if (legacyData) {
        const id = (att as unknown as { id?: string }).id ?? Math.random().toString(36).slice(2, 10);
        const comma = legacyData.indexOf(",");
        const rawBase64 = comma !== -1 ? legacyData.slice(comma + 1) : legacyData;
        const bytes = Uint8Array.from(atob(rawBase64), (c) => c.charCodeAt(0));
        pouchAtts[id] = {
          content_type: "application/octet-stream",
          data: await encryptBytes(key, bytes.buffer as ArrayBuffer),
        };
        newMeta.push({ id, name: att.name, mimeType: att.mimeType, size: att.size });
      } else {
        const { id: existingId, name, mimeType, size } = att as AttachmentMeta;
        newMeta.push({ id: existingId, name, mimeType, size });
      }
    }

    const newPayload: EncPayload = { ...payload, attachments: newMeta.length ? newMeta : undefined };
    const newEnc = await encryptText(key, JSON.stringify(newPayload));

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const latest = (await db.get(raw._id)) as unknown as Entry & {
          _rev?: string;
          _attachments?: Record<string, unknown>;
        };
        await db.put({
          ...latest,
          enc: newEnc,
          _attachments: { ...(latest._attachments ?? {}), ...pouchAtts },
        } as unknown as AnyDoc);
        break;
      } catch (err) {
        if ((err as { status?: number }).status !== 409) break;
      }
    }
  }

  invalidateSearchCache();
  await saveSettings({ migratedAttachmentsV2: true });
}
