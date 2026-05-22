import type { Todo } from "@/types/todo";
import { loadKey, encryptText, decryptText } from "../crypto";

/* @internal — exported for unit tests only */
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

/* @internal — exported for unit tests only */
export async function decryptTodo(todo: Todo): Promise<Todo> {
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
/* @internal */
export function withoutPlaintext(todo: Todo): Todo {
  return todo.encrypted ? { ...todo, text: "" } : todo;
}
