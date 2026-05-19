import type { Entry, Attachment } from "@/types/entry";
import type { Todo } from "@/types/todo";
import { loadKey, encryptText, decryptText } from "./crypto";

type AnyDoc = Entry | Todo;

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

// ─── DB init ─────────────────────────────────────────────────────────────────

let _db: PouchDB.Database<AnyDoc> | null = null;

export async function getDB(): Promise<PouchDB.Database<AnyDoc>> {
  if (_db) return _db;

  const PouchDB = (await import("pouchdb")).default;
  const PouchDBFind = (await import("pouchdb-find")).default;
  PouchDB.plugin(PouchDBFind);

  _db = new PouchDB<AnyDoc>("gleaned");
  // pouchdb-find calls deprecated db.type(); defineProperty on the instance shadows the prototype getter
  Object.defineProperty(_db, "type", { value: () => "idb", writable: true, configurable: true });
  await Promise.all([
    _db.createIndex({ index: { fields: ["type", "date", "createdAt"] } }),
    _db.createIndex({ index: { fields: ["type", "createdAt"] } }),
  ]);

  return _db;
}

// ─── Tags ────────────────────────────────────────────────────────────────────

export async function getStreakData(): Promise<{ streak: number; todayCount: number }> {
  const db = await getDB();
  const today = new Date().toISOString().split("T")[0];
  const result = await db.find({ selector: { type: "entry" }, fields: ["date"] });
  const dates = new Set(result.docs.map((d) => (d as Entry).date));
  const todayCount = result.docs.filter((d) => (d as Entry).date === today).length;

  let streak = 0;
  const cursor = new Date();
  if (!dates.has(today)) cursor.setDate(cursor.getDate() - 1);
  while (true) {
    const ds = cursor.toISOString().split("T")[0];
    if (!dates.has(ds)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { streak, todayCount };
}

export async function getAllTags(): Promise<Map<string, number>> {
  const db = await getDB();
  // Need full docs to decrypt tags — fields projection would drop enc
  const result = await db.find({ selector: { type: "entry" } });
  const decrypted = await Promise.all((result.docs as Entry[]).map(decryptEntry));
  const counts = new Map<string, number>();
  for (const doc of decrypted) {
    for (const tag of doc.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return counts;
}

export async function getEntriesByTag(tag: string): Promise<Entry[]> {
  const db = await getDB();
  const result = await db.find({
    selector: { type: "entry" },
    sort: [{ type: "asc" }, { createdAt: "asc" }],
  });
  const decrypted = await Promise.all((result.docs as Entry[]).map(decryptEntry));
  return decrypted.filter((e) => e.tags?.includes(tag));
}

export async function deleteTag(tag: string): Promise<void> {
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
  return { _id: doc._id, type: "entry", date: doc.date, createdAt: doc.createdAt, content: "", tags: [], encrypted: true, enc };
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

// ─── Entries ────────────────────────────────────────────────────────────────

export async function saveEntry(content: string, tags: string[], attachments?: Attachment[]): Promise<Entry> {
  const db = await getDB();
  const now = new Date();
  const base: Omit<Entry, "_rev" | "encrypted" | "enc"> = {
    _id: `entry_${now.getTime()}_${Math.random().toString(36).slice(2, 7)}`,
    type: "entry",
    content,
    tags,
    date: now.toISOString().split("T")[0],
    createdAt: now.toISOString(),
    ...(attachments?.length ? { attachments } : {}),
  };
  const doc = await encryptEntry(base);
  await db.put(doc as unknown as AnyDoc);
  // Return with plaintext content for immediate display
  return { ...doc, content, tags, ...(attachments?.length ? { attachments } : {}) } as Entry;
}

export async function getEntriesByDate(date: string): Promise<Entry[]> {
  const db = await getDB();
  const result = await db.find({
    selector: { type: "entry", date },
    sort: [{ type: "asc" }, { date: "asc" }, { createdAt: "asc" }],
  });
  return Promise.all((result.docs as Entry[]).map(decryptEntry));
}

export async function getEntryCountsByDate(): Promise<Map<string, number>> {
  const db = await getDB();
  const result = await db.find({ selector: { type: "entry" }, fields: ["date"] });
  const counts = new Map<string, number>();
  for (const doc of result.docs as Entry[]) {
    const d = doc.date;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return counts;
}

export async function getDatesWithEntries(): Promise<Set<string>> {
  const db = await getDB();
  const result = await db.find({
    selector: { type: "entry" },
    fields: ["date"],
  });
  return new Set(result.docs.map((d) => (d as Entry).date));
}

export async function updateEntry(entry: Entry, content: string, tags: string[]): Promise<Entry> {
  const db = await getDB();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const latest = attempt === 0 ? entry : (await db.get(entry._id)) as unknown as Entry;
      const base: Omit<Entry, "_rev" | "encrypted" | "enc"> = {
        _id: latest._id, type: "entry",
        content, tags, date: latest.date, createdAt: latest.createdAt,
        ...(latest.attachments?.length ? { attachments: latest.attachments } : {}),
      };
      const enc = await encryptEntry(base);
      const res = await db.put({ ...enc, _rev: latest._rev } as unknown as AnyDoc);
      return { ...enc, _rev: res.rev, content, tags } as Entry;
    } catch (err) {
      if ((err as { status?: number }).status !== 409) throw err;
    }
  }
  throw new Error("gleaned: too many conflicts updating entry");
}

export async function deleteEntry(id: string): Promise<void> {
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
  throw new Error("gleaned: too many conflicts deleting entry");
}

// ─── Todos ───────────────────────────────────────────────────────────────────

export async function saveTodo(text: string, dueDate?: string): Promise<Todo> {
  const db = await getDB();
  const now = new Date();
  const doc: Omit<Todo, "_rev"> = {
    _id: `todo_${now.getTime()}_${Math.random().toString(36).slice(2, 7)}`,
    type: "todo",
    text,
    done: false,
    createdAt: now.toISOString(),
    ...(dueDate ? { dueDate } : {}),
  };
  await db.put(doc);
  return doc as Todo;
}

export async function getTodos(): Promise<Todo[]> {
  const db = await getDB();
  const result = await db.find({
    selector: { type: "todo" },
    sort: [{ type: "asc" }, { createdAt: "asc" }],
  });
  return result.docs as Todo[];
}

export async function toggleTodo(id: string, rev: string, done: boolean): Promise<void> {
  const db = await getDB();
  await db.put({ _id: id, _rev: rev, type: "todo", done } as unknown as AnyDoc);
}

export async function updateTodoDoc(todo: Todo): Promise<Todo> {
  const db = await getDB();
  const targetDone = !todo.done;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const latest = attempt === 0 ? todo : (await db.get(todo._id)) as unknown as Todo;
      const updated = { ...latest, done: targetDone };
      const res = await db.put(updated);
      return { ...updated, _rev: res.rev };
    } catch (err) {
      if ((err as { status?: number }).status !== 409) throw err;
    }
  }
  throw new Error("gleaned: too many conflicts updating todo");
}

export async function updateTodoDueDate(todo: Todo, dueDate: string | undefined): Promise<Todo> {
  const db = await getDB();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const latest = attempt === 0 ? todo : (await db.get(todo._id)) as unknown as Todo;
      const updated: Todo = { ...latest };
      if (dueDate) updated.dueDate = dueDate;
      else delete updated.dueDate;
      const res = await db.put(updated);
      return { ...updated, _rev: res.rev };
    } catch (err) {
      if ((err as { status?: number }).status !== 409) throw err;
    }
  }
  throw new Error("gleaned: too many conflicts updating todo dueDate");
}

export async function updateTodoText(todo: Todo, text: string): Promise<Todo> {
  const db = await getDB();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const latest = attempt === 0 ? todo : (await db.get(todo._id)) as unknown as Todo;
      const updated = { ...latest, text };
      const res = await db.put(updated);
      return { ...updated, _rev: res.rev };
    } catch (err) {
      if ((err as { status?: number }).status !== 409) throw err;
    }
  }
  throw new Error("gleaned: too many conflicts updating todo text");
}

export async function deleteTodo(id: string): Promise<void> {
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

// ─── Settings ────────────────────────────────────────────────────────────────

export interface Settings {
  _id: "gleaned_settings";
  _rev?: string;
  type: "settings";
  passwordHash?: string;
  encryptionSalt?: string;
  encryptionVerification?: string;
  language?: "de" | "en";
  weekStart?: "monday" | "sunday";
  theme?: "system" | "light" | "dark" | "sepia";
  bodyFont?: "sans" | "serif" | "playfair" | "handwriting";
  couchdbUrl?: string;
  couchdbUsername?: string;
  couchdbPassword?: string;
}

// ─── Conflicts ───────────────────────────────────────────────────────────────

export interface ConflictDoc {
  winner: Entry;
  alternatives: Entry[];
}

export async function getConflicts(): Promise<ConflictDoc[]> {
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
    return (await db.get("gleaned_settings")) as unknown as Settings;
  } catch {
    return null;
  }
}

export async function saveSettings(data: Partial<Settings>): Promise<void> {
  const db = await getDB();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const existing = await getSettings();
      await db.put({
        _id: "gleaned_settings",
        _rev: existing?._rev,
        type: "settings",
        ...existing,
        ...data,
      } as unknown as AnyDoc);
      return;
    } catch (err) {
      if ((err as { status?: number }).status !== 409) throw err;
      // 409 conflict — re-fetch latest rev and retry
    }
  }
  throw new Error("gleaned: too many conflicts saving settings");
}

// ─── Export / Import ─────────────────────────────────────────────────────────

export async function exportData(): Promise<string> {
  const db = await getDB();
  const result = await db.allDocs({ include_docs: true });
  const docs = result.rows
    .filter((r) => r.doc && (r.doc.type === "entry" || r.doc.type === "todo"))
    .map((r) => {
      const { _rev, ...doc } = r.doc as AnyDoc & { _rev?: string };
      void _rev;
      return doc;
    });
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), docs }, null, 2);
}

export async function importData(json: string): Promise<{ imported: number; skipped: number }> {
  const db = await getDB();
  const parsed = JSON.parse(json) as { docs?: unknown[] } | unknown[];
  const rawDocs: unknown[] = Array.isArray(parsed) ? parsed : ((parsed as { docs?: unknown[] }).docs ?? []);

  let imported = 0;
  let skipped = 0;

  for (const raw of rawDocs) {
    const doc = raw as Record<string, unknown>;
    const id = doc._id as string;
    if (!id || !doc.type) { skipped++; continue; }
    try {
      await db.get(id);
      skipped++;
    } catch (e) {
      if ((e as { status?: number }).status === 404) {
        const { _rev, ...toInsert } = doc;
        void _rev;
        await db.put(toInsert as unknown as AnyDoc);
        imported++;
      } else {
        skipped++;
      }
    }
  }

  return { imported, skipped };
}
