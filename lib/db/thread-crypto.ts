import type { Thread } from "@/types/thread";
import { loadKey, encryptText, decryptText } from "../crypto";

/* @internal — exported for unit tests only */
export async function encryptThread(
  doc: Omit<Thread, "_rev" | "encrypted" | "textEnc">,
): Promise<Omit<Thread, "_rev">> {
  const key = await loadKey();
  if (!key) return doc;
  const textEnc = await encryptText(key, doc.text);
  return {
    _id: doc._id, type: "thread",
    text: "", done: doc.done, createdAt: doc.createdAt,
    encrypted: true, textEnc,
    ...(doc.dueDate ? { dueDate: doc.dueDate } : {}),
    ...(doc.color  ? { color:  doc.color  } : {}),
  };
}

/* @internal — exported for unit tests only */
export async function decryptThread(thread: Thread): Promise<Thread> {
  if (!thread.encrypted || !thread.textEnc) return thread;
  const key = await loadKey();
  if (!key) return thread;
  try {
    return { ...thread, text: await decryptText(key, thread.textEnc) };
  } catch {
    return thread;
  }
}

// Strips plaintext from a decrypted thread before writing back to the DB.
// Needed when non-text fields (done/dueDate/color) are updated: the in-memory
// thread has both the decrypted text and the enc fields; we must not persist the
// plaintext alongside the ciphertext.
/* @internal */
export function withoutPlaintext(thread: Thread): Thread {
  return thread.encrypted ? { ...thread, text: "" } : thread;
}

// ─── API crypto (SQLite wire format) ─────────────────────────────────────────

// Wire format returned by the threads API (same shape for request body and response).
export interface ThreadApiRow {
  id: string;
  done: number; // 0 or 1
  due_date: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
  data_enc: string; // base64: encryptText output (IV || ciphertext, base64-encoded)
}

// Content fields that live inside data_enc (never as plain DB columns).
// Add new fields here to extend what gets encrypted per thread.
interface ThreadPayload {
  text: string;
  notes?: string;
  // future fields go here — the shape is forward-compatible (unknown keys are ignored on read)
}

export async function encryptThreadToApi(
  thread: Omit<Thread, "_rev" | "encrypted" | "textEnc">,
): Promise<ThreadApiRow> {
  const key = await loadKey();
  if (!key) throw new Error("encryption key not loaded — authenticate before writing threads");
  const payload: ThreadPayload = { text: thread.text };
  if (thread.notes) payload.notes = thread.notes;
  const data_enc = await encryptText(key, JSON.stringify(payload));
  return {
    id: thread._id,
    done: thread.done ? 1 : 0,
    due_date: thread.dueDate ?? null,
    color: thread.color ?? null,
    created_at: thread.createdAt,
    updated_at: new Date().toISOString(),
    data_enc,
  };
}

export async function decryptThreadFromRow(row: ThreadApiRow): Promise<Thread> {
  const key = await loadKey();
  if (!key) throw new Error("encryption key not loaded — authenticate before reading threads");
  let payload: ThreadPayload = { text: "" };
  try {
    const json = await decryptText(key, row.data_enc);
    payload = JSON.parse(json) as ThreadPayload;
  } catch {}
  return {
    _id: row.id,
    type: "thread",
    text: payload.text ?? "",
    done: row.done !== 0,
    createdAt: row.created_at,
    ...(row.due_date    ? { dueDate: row.due_date } : {}),
    ...(row.color       ? { color:   row.color    } : {}),
    ...(payload.notes   ? { notes:   payload.notes } : {}),
  };
}
