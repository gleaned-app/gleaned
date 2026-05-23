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
