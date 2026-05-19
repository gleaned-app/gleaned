import type { Entry } from "@/types/entry";
import type { Todo } from "@/types/todo";

type AnyDoc = Entry | Todo;

let _db: PouchDB.Database<AnyDoc> | null = null;

export async function getDB(): Promise<PouchDB.Database<AnyDoc>> {
  if (_db) return _db;

  const PouchDB = (await import("pouchdb")).default;
  const PouchDBFind = (await import("pouchdb-find")).default;
  PouchDB.plugin(PouchDBFind);

  _db = new PouchDB<AnyDoc>("gleaned");
  await Promise.all([
    _db.createIndex({ index: { fields: ["type", "date", "createdAt"] } }),
    _db.createIndex({ index: { fields: ["type", "createdAt"] } }),
  ]);

  const remoteUrl = process.env.NEXT_PUBLIC_COUCHDB_URL;
  if (remoteUrl) {
    _db.sync(remoteUrl, {
      live: true,
      retry: true,
    }).on("error", (err) => {
      console.error("gleaned: sync error", err);
    });
  }

  return _db;
}

// ─── Entries ────────────────────────────────────────────────────────────────

export async function saveEntry(content: string, tags: string[]): Promise<Entry> {
  const db = await getDB();
  const now = new Date();
  const doc: Omit<Entry, "_rev"> = {
    _id: `entry_${now.getTime()}_${Math.random().toString(36).slice(2, 7)}`,
    type: "entry",
    content,
    tags,
    date: now.toISOString().split("T")[0],
    createdAt: now.toISOString(),
  };
  await db.put(doc);
  return doc as Entry;
}

export async function getEntriesByDate(date: string): Promise<Entry[]> {
  const db = await getDB();
  const result = await db.find({
    selector: { type: "entry", date },
    sort: [{ type: "asc" }, { date: "asc" }, { createdAt: "asc" }],
  });
  return result.docs as Entry[];
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
      const updated = { ...latest, content, tags };
      const res = await db.put(updated);
      return { ...updated, _rev: res.rev };
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
  language?: "de" | "en";
  weekStart?: "monday" | "sunday";
  theme?: "system" | "light" | "dark" | "sepia";
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
