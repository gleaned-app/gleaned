import type { Thread } from "@/types/thread";
import { getDB, requireAuth } from "./client";
import type { AnyDoc } from "./client";
import { encryptThread, decryptThread, withoutPlaintext } from "./thread-crypto";
import { loadKey } from "../crypto";

export async function saveThread(text: string, dueDate?: string, color?: string): Promise<Thread> {
  requireAuth();
  const db = await getDB();
  const now = new Date();
  const base: Omit<Thread, "_rev" | "encrypted" | "textEnc"> = {
    _id: `thread_${now.getTime()}_${Math.random().toString(36).slice(2, 7)}`,
    type: "thread",
    text,
    done: false,
    createdAt: now.toISOString(),
    ...(dueDate ? { dueDate } : {}),
    ...(color ? { color } : {}),
  };
  const doc = await encryptThread(base);
  await db.put(doc as unknown as AnyDoc);
  return { ...doc, text } as Thread;
}

export async function getThreads(): Promise<Thread[]> {
  requireAuth();
  const db = await getDB();
  const result = await db.find({
    selector: { type: "thread" },
    sort: [{ type: "asc" }, { createdAt: "asc" }],
  });
  return Promise.all((result.docs as Thread[]).map(decryptThread));
}

export async function updateThreadDoc(thread: Thread): Promise<Thread> {
  requireAuth();
  const db = await getDB();
  const targetDone = !thread.done;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const latest = attempt === 0 ? thread : (await db.get(thread._id)) as unknown as Thread;
      const updated = { ...withoutPlaintext(latest), done: targetDone };
      const res = await db.put(updated as unknown as AnyDoc);
      return { ...updated, _rev: res.rev, text: thread.text } as Thread;
    } catch (err) {
      if ((err as { status?: number }).status !== 409) throw err;
    }
  }
  throw new Error("gleaned: too many conflicts updating thread");
}

export async function updateThreadDueDate(thread: Thread, dueDate: string | undefined): Promise<Thread> {
  requireAuth();
  const db = await getDB();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const latest = attempt === 0 ? thread : (await db.get(thread._id)) as unknown as Thread;
      const updated: Thread = { ...withoutPlaintext(latest) };
      if (dueDate) updated.dueDate = dueDate;
      else delete updated.dueDate;
      const res = await db.put(updated as unknown as AnyDoc);
      return { ...updated, _rev: res.rev, text: thread.text } as Thread;
    } catch (err) {
      if ((err as { status?: number }).status !== 409) throw err;
    }
  }
  throw new Error("gleaned: too many conflicts updating thread dueDate");
}

export async function updateThreadColor(thread: Thread, color: string | undefined): Promise<Thread> {
  requireAuth();
  const db = await getDB();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const latest = attempt === 0 ? thread : (await db.get(thread._id)) as unknown as Thread;
      const updated: Thread = { ...withoutPlaintext(latest) };
      if (color) updated.color = color;
      else delete updated.color;
      const res = await db.put(updated as unknown as AnyDoc);
      return { ...updated, _rev: res.rev, text: thread.text } as Thread;
    } catch (err) {
      if ((err as { status?: number }).status !== 409) throw err;
    }
  }
  throw new Error("gleaned: too many conflicts updating thread color");
}

export async function updateThreadText(thread: Thread, text: string): Promise<Thread> {
  requireAuth();
  const db = await getDB();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const latest = attempt === 0 ? thread : (await db.get(thread._id)) as unknown as Thread;
      const base: Omit<Thread, "_rev" | "encrypted" | "textEnc"> = {
        _id: latest._id, type: "thread",
        text, done: latest.done, createdAt: latest.createdAt,
        ...(latest.dueDate ? { dueDate: latest.dueDate } : {}),
        ...(latest.color  ? { color:  latest.color  } : {}),
      };
      const enc = await encryptThread(base);
      const res = await db.put({ ...enc, _rev: latest._rev } as unknown as AnyDoc);
      return { ...enc, _rev: res.rev, text } as Thread;
    } catch (err) {
      if ((err as { status?: number }).status !== 409) throw err;
    }
  }
  throw new Error("gleaned: too many conflicts updating thread text");
}

export async function deleteThread(id: string): Promise<void> {
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
  throw new Error("gleaned: too many conflicts deleting thread");
}

// One-shot migration: re-encrypts any threads that were created before encryption
// was added. Runs fire-and-forget in the background after every login.
export async function migrateThreadsEncryption(): Promise<void> {
  const key = await loadKey();
  if (!key) return;
  const db = await getDB();
  const result = await db.find({ selector: { type: "thread" } });
  const plain = (result.docs as Thread[]).filter((t) => !t.encrypted && t.text);
  for (const thread of plain) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const latest = attempt === 0 ? thread : (await db.get(thread._id)) as unknown as Thread;
        if ((latest as { encrypted?: boolean }).encrypted) break;
        const base: Omit<Thread, "_rev" | "encrypted" | "textEnc"> = {
          _id: latest._id, type: "thread",
          text: latest.text, done: latest.done, createdAt: latest.createdAt,
          ...(latest.dueDate ? { dueDate: latest.dueDate } : {}),
          ...(latest.color  ? { color:  latest.color  } : {}),
        };
        const enc = await encryptThread(base);
        await db.put({ ...enc, _rev: latest._rev } as unknown as AnyDoc);
        break;
      } catch (err) {
        if ((err as { status?: number }).status !== 409) break;
      }
    }
  }
}
