import type { Todo } from "@/types/todo";
import { getDB, requireAuth } from "./client";
import type { AnyDoc } from "./client";
import { encryptTodo, decryptTodo, withoutPlaintext } from "./todo-crypto";
import { loadKey } from "../crypto";

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

// One-shot migration: re-encrypts any todos that were created before encryption
// was added. Runs fire-and-forget in the background after every login.
export async function migrateTodosEncryption(): Promise<void> {
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
