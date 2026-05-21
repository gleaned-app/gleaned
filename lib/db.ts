import type { Entry, Attachment } from "@/types/entry";
import type { Todo } from "@/types/todo";
import { loadKey, encryptText, decryptText } from "./crypto";

type AnyDoc = Entry | Todo;

// Upper bound for metadata-only queries (IDs + dates, no enc blobs).
// A journal with 5 entries/day reaches this after ~2.7 years.
const QUERY_METADATA_LIMIT = 5000;
// Upper bound for queries that decrypt entry content.
const QUERY_DECRYPT_LIMIT = 2000;

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
  if (authenticated) migrateTodosEncryption().catch(() => {});
}

function requireAuth(): void {
  if (_dbAuthState === "locked") throw new Error("gleaned: not authenticated");
}

// ─── Tags cache ──────────────────────────────────────────────────────────────

let _tagsCache: Map<string, number> | null = null;
let _tagsCacheTime = 0;
const TAGS_CACHE_TTL = 60_000;

function invalidateTagsCache() { _tagsCache = null; }

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
  const now = Date.now();
  if (_tagsCache && now - _tagsCacheTime < TAGS_CACHE_TTL) return _tagsCache;
  const db = await getDB();
  const result = await db.find({ selector: { type: "entry" } });
  const decrypted = await Promise.all((result.docs as unknown[]).filter(isEntry).map(decryptEntry));
  const counts = new Map<string, number>();
  for (const doc of decrypted) {
    for (const tag of doc.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  _tagsCache = counts;
  _tagsCacheTime = now;
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
        const latest = (await db.get(doc._id)) as unknown as Entry;
        const base: Omit<Entry, "_rev" | "encrypted" | "enc"> = {
          _id: latest._id, type: "entry",
          content: doc.content, tags: newTags,
          date: latest.date, createdAt: latest.createdAt,
          ...(latest.nextReview !== undefined ? { nextReview: latest.nextReview } : {}),
          ...(latest.reviewInterval !== undefined ? { reviewInterval: latest.reviewInterval } : {}),
          ...(doc.attachments?.length ? { attachments: doc.attachments } : {}),
        };
        const enc = await encryptEntry(base);
        await db.put({ ...enc, _rev: latest._rev } as unknown as AnyDoc);
        break;
      } catch (err) {
        if ((err as { status?: number }).status !== 409) throw err;
      }
    }
  }
  invalidateTagsCache();
  invalidateSearchCache();
}

// ─── Entry encryption helpers ────────────────────────────────────────────────

interface EncPayload {
  content: string;
  tags: string[];
  attachments?: Attachment[];
}

async function encryptEntry(
  doc: Omit<Entry, "_rev" | "encrypted" | "enc">,
): Promise<Omit<Entry, "_rev">> {
  const key = await loadKey();
  if (!key) return doc;
  const payload: EncPayload = {
    content: doc.content,
    tags: doc.tags,
    ...(doc.attachments?.length ? { attachments: doc.attachments } : {}),
  };
  const enc = await encryptText(key, JSON.stringify(payload));
  return {
    _id: doc._id, type: "entry", date: doc.date, createdAt: doc.createdAt,
    content: "", tags: [], encrypted: true, enc,
    ...(doc.nextReview !== undefined ? { nextReview: doc.nextReview } : {}),
    ...(doc.reviewInterval !== undefined ? { reviewInterval: doc.reviewInterval } : {}),
  };
}

async function decryptEntry(entry: Entry): Promise<Entry> {
  if (!entry.encrypted || !entry.enc) return entry;
  const key = await loadKey();
  if (!key) return entry;
  try {
    const payload = JSON.parse(await decryptText(key, entry.enc)) as EncPayload;
    return { ...entry, content: payload.content, tags: payload.tags, attachments: payload.attachments };
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
        const { _rev, ...base } = latest as Todo & { _rev?: string };
        void _rev;
        const enc = await encryptTodo(base as Omit<Todo, "_rev" | "encrypted" | "textEnc">);
        await db.put({ ...enc, _rev: latest._rev } as unknown as AnyDoc);
        break;
      } catch (err) {
        if ((err as { status?: number }).status !== 409) break;
      }
    }
  }
}

// ─── Entries ────────────────────────────────────────────────────────────────

export async function saveEntry(content: string, tags: string[], attachments?: Attachment[]): Promise<Entry> {
  requireAuth();
  const db = await getDB();
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
  };
  const doc = await encryptEntry(base);
  await db.put(doc as unknown as AnyDoc);
  invalidateTagsCache();
  const saved: Entry = { ...doc, content, tags, ...(attachments?.length ? { attachments } : {}) } as Entry;
  if (_searchCache !== null) _searchCache = [saved, ..._searchCache];
  return saved;
}

export async function getEntriesByDate(date: string): Promise<Entry[]> {
  requireAuth();
  const db = await getDB();
  const result = await db.find({
    selector: { type: "entry", date },
    sort: [{ type: "asc" }, { date: "asc" }, { createdAt: "asc" }],
  });
  return Promise.all((result.docs as unknown[]).filter(isEntry).map(decryptEntry));
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

export async function updateEntry(entry: Entry, content: string, tags: string[]): Promise<Entry> {
  requireAuth();
  const db = await getDB();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const latest = attempt === 0 ? entry : (await db.get(entry._id)) as unknown as Entry;
      const base: Omit<Entry, "_rev" | "encrypted" | "enc"> = {
        _id: latest._id, type: "entry",
        content, tags, date: latest.date, createdAt: latest.createdAt,
        ...(latest.nextReview !== undefined ? { nextReview: latest.nextReview } : {}),
        ...(latest.reviewInterval !== undefined ? { reviewInterval: latest.reviewInterval } : {}),
        ...(latest.attachments?.length ? { attachments: latest.attachments } : {}),
      };
      const enc = await encryptEntry(base);
      const res = await db.put({ ...enc, _rev: latest._rev } as unknown as AnyDoc);
      invalidateTagsCache();
      const updated = { ...enc, _rev: res.rev, content, tags } as Entry;
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
      const { _rev, encrypted: _e, textEnc: _t, ...rest } = latest as Todo & { _rev?: string; encrypted?: boolean; textEnc?: string };
      void _rev; void _e; void _t;
      const enc = await encryptTodo({ ...rest, text } as Omit<Todo, "_rev" | "encrypted" | "textEnc">);
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

export async function getReviewDue(maxBackfill = 10): Promise<Entry[]> {
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

  const scheduledIds = all
    .filter((e) => e.nextReview && e.nextReview <= today)
    .slice(0, 20)
    .map((e) => e._id);

  const remaining = Math.max(0, maxBackfill - scheduledIds.length);
  const backfillIds = remaining > 0
    ? all
        .filter((e) => !e.nextReview && e.date < today)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, remaining)
        .map((e) => e._id)
    : [];

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
  const backfill  = all.filter((e) => !e.nextReview && e.date < today).length;
  return Math.min(scheduled, 20) + Math.min(Math.max(0, 10 - Math.min(scheduled, 20)), backfill);
}

export async function markReviewed(entry: Entry, remembered: boolean): Promise<Entry> {
  requireAuth();
  const db = await getDB();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const latest = attempt === 0
        ? entry
        : (await db.get(entry._id)) as unknown as Entry;
      const currentInterval = latest.reviewInterval ?? 1;
      const newInterval = remembered ? Math.min(currentInterval * 2, 60) : 1;
      const nextReview = toLocalDateStr(new Date(Date.now() + newInterval * 86_400_000));
      const updated = { ...latest, reviewInterval: newInterval, nextReview };
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
  const current = (await db.get(id)) as Entry;

  if (current._rev !== keepRev) {
    // User chose an alternative — decrypt it and overwrite the winner
    const keepRaw = (await db.get(id, { rev: keepRev })) as Entry;
    const keep = await decryptEntry(keepRaw);
    const base: Omit<Entry, "_rev" | "encrypted" | "enc"> = {
      _id: id, type: "entry",
      content: keep.content, tags: keep.tags,
      date: keep.date, createdAt: keep.createdAt,
      ...(keep.attachments ? { attachments: keep.attachments } : {}),
    };
    const enc = await encryptEntry(base);
    await db.put({ ...enc, _rev: current._rev } as unknown as AnyDoc);
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

      const { couchdbPassword: _legacy, ...safeExisting } = rawExisting ?? {};
      void _legacy;

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
  const result = await db.allDocs({ include_docs: true });
  // Decrypt entries so the export is portable across devices and passwords.
  const docs = await Promise.all(
    result.rows
      .filter((r) => r.doc && (r.doc.type === "entry" || r.doc.type === "todo"))
      .map(async (r) => {
        const { _rev, ...doc } = r.doc as AnyDoc & { _rev?: string };
        void _rev;
        if (doc.type === "entry" && (doc as Entry & { encrypted?: boolean }).encrypted) {
          const decrypted = await decryptEntry(doc as Entry);
          const { encrypted: _e, enc: _enc, ...plain } =
            decrypted as Entry & { encrypted?: boolean; enc?: string };
          void _e; void _enc;
          return plain;
        }
        if (doc.type === "todo" && (doc as Todo & { encrypted?: boolean }).encrypted) {
          const decrypted = await decryptTodo(doc as Todo);
          const { encrypted: _e, textEnc: _t, ...plain } =
            decrypted as Todo & { encrypted?: boolean; textEnc?: string };
          void _e; void _t;
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
