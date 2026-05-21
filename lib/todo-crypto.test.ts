import { describe, it, expect, beforeEach } from "vitest";
import { deriveKey, generateSalt, storeKey, clearKey } from "./crypto";
import { encryptTodo, decryptTodo, withoutPlaintext } from "./db";
import type { Todo } from "@/types/todo";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function setupKey(): Promise<CryptoKey> {
  const key = await deriveKey("testpassword", generateSalt());
  await storeKey(key);
  return key;
}

function baseTodo(overrides: Partial<Omit<Todo, "_rev">> = {}): Omit<Todo, "_rev" | "encrypted" | "textEnc"> {
  return {
    _id: "todo_1234_abcde",
    type: "todo",
    text: "Learn TypeScript generics",
    done: false,
    createdAt: "2026-01-01T10:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  clearKey();
});

// ─── encryptTodo ─────────────────────────────────────────────────────────────

describe("encryptTodo", () => {
  it("sets encrypted=true and populates textEnc", async () => {
    await setupKey();
    const doc = await encryptTodo(baseTodo());
    expect(doc.encrypted).toBe(true);
    expect(typeof doc.textEnc).toBe("string");
    expect(doc.textEnc!.length).toBeGreaterThan(0);
  });

  it("clears the plaintext text field", async () => {
    await setupKey();
    const doc = await encryptTodo(baseTodo({ text: "secret goal" }));
    expect(doc.text).toBe("");
  });

  it("preserves all non-text fields unchanged", async () => {
    await setupKey();
    const input = baseTodo({ done: true, dueDate: "2026-06-01", color: "#ff0000" });
    const doc = await encryptTodo(input);
    expect(doc._id).toBe(input._id);
    expect(doc.type).toBe("todo");
    expect(doc.done).toBe(true);
    expect(doc.dueDate).toBe("2026-06-01");
    expect(doc.color).toBe("#ff0000");
    expect(doc.createdAt).toBe(input.createdAt);
  });

  it("omits dueDate and color when not provided", async () => {
    await setupKey();
    const doc = await encryptTodo(baseTodo());
    expect(doc.dueDate).toBeUndefined();
    expect(doc.color).toBeUndefined();
  });

  it("produces different ciphertext on each call (random IV per encrypt)", async () => {
    await setupKey();
    const input = baseTodo();
    const doc1 = await encryptTodo(input);
    const doc2 = await encryptTodo(input);
    expect(doc1.textEnc).not.toBe(doc2.textEnc);
  });

  it("is a no-op (returns doc unchanged) when no key is loaded", async () => {
    // No storeKey call — key cache is empty.
    const input = baseTodo({ text: "plaintext" });
    const doc = await encryptTodo(input) as Todo;
    expect(doc.encrypted).toBeUndefined();
    expect(doc.textEnc).toBeUndefined();
    expect(doc.text).toBe("plaintext");
  });

  it("encrypts empty string text", async () => {
    await setupKey();
    const doc = await encryptTodo(baseTodo({ text: "" }));
    expect(doc.encrypted).toBe(true);
    expect(typeof doc.textEnc).toBe("string");
  });

  it("encrypts unicode and emoji text", async () => {
    await setupKey();
    const doc = await encryptTodo(baseTodo({ text: "Lernziel: 🧠 Konzept verstehen" }));
    const decrypted = await decryptTodo(doc as Todo);
    expect(decrypted.text).toBe("Lernziel: 🧠 Konzept verstehen");
  });
});

// ─── decryptTodo ─────────────────────────────────────────────────────────────

describe("decryptTodo", () => {
  it("round-trip: decrypted text matches original", async () => {
    await setupKey();
    const encrypted = await encryptTodo(baseTodo({ text: "original text" }));
    const decrypted = await decryptTodo(encrypted as Todo);
    expect(decrypted.text).toBe("original text");
  });

  it("returns todo unchanged when encrypted=false", async () => {
    await setupKey();
    const plain: Todo = { ...baseTodo(), text: "not encrypted" };
    const result = await decryptTodo(plain);
    expect(result).toBe(plain);
    expect(result.text).toBe("not encrypted");
  });

  it("returns todo unchanged when textEnc is missing (corrupted doc)", async () => {
    await setupKey();
    const corrupt = { ...baseTodo(), encrypted: true } as unknown as Todo;
    const result = await decryptTodo(corrupt);
    expect(result).toBe(corrupt);
  });

  it("returns todo unchanged when no key is loaded", async () => {
    const key = await setupKey();
    const encrypted = await encryptTodo(baseTodo({ text: "secret" })) as Todo;
    clearKey();
    const result = await decryptTodo(encrypted);
    // No key → returns as-is with text still ""
    expect(result.text).toBe("");
    expect(result.encrypted).toBe(true);
    // Restore and verify the ciphertext is still valid
    await storeKey(key);
    const recovered = await decryptTodo(encrypted);
    expect(recovered.text).toBe("secret");
  });

  it("returns todo unchanged when ciphertext is tampered (graceful fail)", async () => {
    await setupKey();
    const encrypted = await encryptTodo(baseTodo({ text: "fragile" })) as Todo;
    const tampered: Todo = { ...encrypted, textEnc: btoa("not-a-valid-ciphertext") };
    const result = await decryptTodo(tampered);
    // decryptTodo catches the error and returns the todo with empty text
    expect(result.text).toBe("");
    expect(result.encrypted).toBe(true);
  });

  it("round-trip preserves all non-text fields", async () => {
    await setupKey();
    const input = baseTodo({ done: true, dueDate: "2026-07-15", color: "#00ff00" });
    const encrypted = await encryptTodo(input) as Todo;
    const decrypted = await decryptTodo(encrypted);
    expect(decrypted.done).toBe(true);
    expect(decrypted.dueDate).toBe("2026-07-15");
    expect(decrypted.color).toBe("#00ff00");
    expect(decrypted._id).toBe(input._id);
    expect(decrypted.createdAt).toBe(input.createdAt);
  });
});

// ─── withoutPlaintext ─────────────────────────────────────────────────────────

describe("withoutPlaintext", () => {
  it("clears text to '' when todo is encrypted", () => {
    const todo: Todo = {
      _id: "todo_1",
      type: "todo",
      text: "decrypted plaintext",
      done: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      encrypted: true,
      textEnc: "somebase64ciphertext",
    };
    const result = withoutPlaintext(todo);
    expect(result.text).toBe("");
  });

  it("preserves all other fields when encrypted", () => {
    const todo: Todo = {
      _id: "todo_2",
      type: "todo",
      text: "should be cleared",
      done: true,
      createdAt: "2026-02-01T00:00:00.000Z",
      dueDate: "2026-03-01",
      color: "#abc123",
      encrypted: true,
      textEnc: "cipher",
    };
    const result = withoutPlaintext(todo);
    expect(result.done).toBe(true);
    expect(result.dueDate).toBe("2026-03-01");
    expect(result.color).toBe("#abc123");
    expect(result.encrypted).toBe(true);
    expect(result.textEnc).toBe("cipher");
    expect(result._id).toBe("todo_2");
  });

  it("leaves text unchanged when todo is NOT encrypted", () => {
    const todo: Todo = {
      _id: "todo_3",
      type: "todo",
      text: "plaintext todo",
      done: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const result = withoutPlaintext(todo);
    expect(result.text).toBe("plaintext todo");
    expect(result).toBe(todo);
  });

  it("does not mutate the original todo", () => {
    const todo: Todo = {
      _id: "todo_4",
      type: "todo",
      text: "original",
      done: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      encrypted: true,
      textEnc: "cipher",
    };
    withoutPlaintext(todo);
    expect(todo.text).toBe("original");
  });

  it("is idempotent: calling twice produces same result", () => {
    const todo: Todo = {
      _id: "todo_5",
      type: "todo",
      text: "some text",
      done: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      encrypted: true,
      textEnc: "cipher",
    };
    const once = withoutPlaintext(todo);
    const twice = withoutPlaintext(once);
    expect(twice.text).toBe("");
  });
});

// ─── encrypt → withoutPlaintext → decrypt (update flow) ─────────────────────

describe("update-without-text-leak flow", () => {
  it("withoutPlaintext on a decrypted todo never leaks plaintext to DB", async () => {
    await setupKey();
    const encrypted = await encryptTodo(baseTodo({ text: "sensitive goal" })) as Todo;

    // Simulate decryption (UI has the todo in memory)
    const decrypted = await decryptTodo(encrypted);
    expect(decrypted.text).toBe("sensitive goal");

    // Simulate a done-toggle update: strip plaintext before writing to DB
    const forDb = withoutPlaintext({ ...decrypted, done: true });
    expect(forDb.text).toBe("");
    expect(forDb.done).toBe(true);
    expect(forDb.textEnc).toBe(encrypted.textEnc);
  });

  it("text remains recoverable after a non-text update round-trip", async () => {
    const key = await setupKey();
    const encrypted = await encryptTodo(baseTodo({ text: "recoverable" })) as Todo;

    const decrypted = await decryptTodo(encrypted);
    const forDb = withoutPlaintext({ ...decrypted, dueDate: "2026-12-31" });

    // Simulate re-loading from DB (forDb is what was persisted)
    clearKey();
    await storeKey(key);
    const reloaded = await decryptTodo(forDb);
    expect(reloaded.text).toBe("recoverable");
    expect(reloaded.dueDate).toBe("2026-12-31");
  });
});
