import { describe, it, expect, beforeEach } from "vitest";
import { deriveKey, generateSalt, storeKey, clearKey } from "./crypto";
import { encryptThread, decryptThread, withoutPlaintext } from "./db/thread-crypto";
import type { Thread } from "@/types/thread";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function setupKey(): Promise<CryptoKey> {
  const key = await deriveKey("testpassword", generateSalt());
  await storeKey(key);
  return key;
}

function baseThread(overrides: Partial<Omit<Thread, "_rev">> = {}): Omit<Thread, "_rev" | "encrypted" | "textEnc"> {
  return {
    _id: "thread_1234_abcde",
    type: "thread",
    text: "Learn TypeScript generics",
    done: false,
    createdAt: "2026-01-01T10:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  clearKey();
});

// ─── encryptThread ────────────────────────────────────────────────────────────

describe("encryptThread", () => {
  it("sets encrypted=true and populates textEnc", async () => {
    await setupKey();
    const doc = await encryptThread(baseThread());
    expect(doc.encrypted).toBe(true);
    expect(typeof doc.textEnc).toBe("string");
    expect(doc.textEnc!.length).toBeGreaterThan(0);
  });

  it("clears the plaintext text field", async () => {
    await setupKey();
    const doc = await encryptThread(baseThread({ text: "secret goal" }));
    expect(doc.text).toBe("");
  });

  it("preserves all non-text fields unchanged", async () => {
    await setupKey();
    const input = baseThread({ done: true, dueDate: "2026-06-01", color: "#ff0000" });
    const doc = await encryptThread(input);
    expect(doc._id).toBe(input._id);
    expect(doc.type).toBe("thread");
    expect(doc.done).toBe(true);
    expect(doc.dueDate).toBe("2026-06-01");
    expect(doc.color).toBe("#ff0000");
    expect(doc.createdAt).toBe(input.createdAt);
  });

  it("omits dueDate and color when not provided", async () => {
    await setupKey();
    const doc = await encryptThread(baseThread());
    expect(doc.dueDate).toBeUndefined();
    expect(doc.color).toBeUndefined();
  });

  it("produces different ciphertext on each call (random IV per encrypt)", async () => {
    await setupKey();
    const input = baseThread();
    const doc1 = await encryptThread(input);
    const doc2 = await encryptThread(input);
    expect(doc1.textEnc).not.toBe(doc2.textEnc);
  });

  it("is a no-op (returns doc unchanged) when no key is loaded", async () => {
    // No storeKey call — key cache is empty.
    const input = baseThread({ text: "plaintext" });
    const doc = await encryptThread(input) as Thread;
    expect(doc.encrypted).toBeUndefined();
    expect(doc.textEnc).toBeUndefined();
    expect(doc.text).toBe("plaintext");
  });

  it("encrypts empty string text", async () => {
    await setupKey();
    const doc = await encryptThread(baseThread({ text: "" }));
    expect(doc.encrypted).toBe(true);
    expect(typeof doc.textEnc).toBe("string");
  });

  it("encrypts unicode and emoji text", async () => {
    await setupKey();
    const doc = await encryptThread(baseThread({ text: "Lernziel: 🧠 Konzept verstehen" }));
    const decrypted = await decryptThread(doc as Thread);
    expect(decrypted.text).toBe("Lernziel: 🧠 Konzept verstehen");
  });
});

// ─── decryptThread ────────────────────────────────────────────────────────────

describe("decryptThread", () => {
  it("round-trip: decrypted text matches original", async () => {
    await setupKey();
    const encrypted = await encryptThread(baseThread({ text: "original text" }));
    const decrypted = await decryptThread(encrypted as Thread);
    expect(decrypted.text).toBe("original text");
  });

  it("returns thread unchanged when encrypted=false", async () => {
    await setupKey();
    const plain: Thread = { ...baseThread(), text: "not encrypted" };
    const result = await decryptThread(plain);
    expect(result).toBe(plain);
    expect(result.text).toBe("not encrypted");
  });

  it("returns thread unchanged when textEnc is missing (corrupted doc)", async () => {
    await setupKey();
    const corrupt = { ...baseThread(), encrypted: true } as unknown as Thread;
    const result = await decryptThread(corrupt);
    expect(result).toBe(corrupt);
  });

  it("returns thread unchanged when no key is loaded", async () => {
    const key = await setupKey();
    const encrypted = await encryptThread(baseThread({ text: "secret" })) as Thread;
    clearKey();
    const result = await decryptThread(encrypted);
    // No key → returns as-is with text still ""
    expect(result.text).toBe("");
    expect(result.encrypted).toBe(true);
    // Restore and verify the ciphertext is still valid
    await storeKey(key);
    const recovered = await decryptThread(encrypted);
    expect(recovered.text).toBe("secret");
  });

  it("returns thread unchanged when ciphertext is tampered (graceful fail)", async () => {
    await setupKey();
    const encrypted = await encryptThread(baseThread({ text: "fragile" })) as Thread;
    const tampered: Thread = { ...encrypted, textEnc: btoa("not-a-valid-ciphertext") };
    const result = await decryptThread(tampered);
    // decryptThread catches the error and returns the thread with empty text
    expect(result.text).toBe("");
    expect(result.encrypted).toBe(true);
  });

  it("round-trip preserves all non-text fields", async () => {
    await setupKey();
    const input = baseThread({ done: true, dueDate: "2026-07-15", color: "#00ff00" });
    const encrypted = await encryptThread(input) as Thread;
    const decrypted = await decryptThread(encrypted);
    expect(decrypted.done).toBe(true);
    expect(decrypted.dueDate).toBe("2026-07-15");
    expect(decrypted.color).toBe("#00ff00");
    expect(decrypted._id).toBe(input._id);
    expect(decrypted.createdAt).toBe(input.createdAt);
  });
});

// ─── withoutPlaintext ─────────────────────────────────────────────────────────

describe("withoutPlaintext", () => {
  it("clears text to '' when thread is encrypted", () => {
    const thread: Thread = {
      _id: "thread_1",
      type: "thread",
      text: "decrypted plaintext",
      done: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      encrypted: true,
      textEnc: "somebase64ciphertext",
    };
    const result = withoutPlaintext(thread);
    expect(result.text).toBe("");
  });

  it("preserves all other fields when encrypted", () => {
    const thread: Thread = {
      _id: "thread_2",
      type: "thread",
      text: "should be cleared",
      done: true,
      createdAt: "2026-02-01T00:00:00.000Z",
      dueDate: "2026-03-01",
      color: "#abc123",
      encrypted: true,
      textEnc: "cipher",
    };
    const result = withoutPlaintext(thread);
    expect(result.done).toBe(true);
    expect(result.dueDate).toBe("2026-03-01");
    expect(result.color).toBe("#abc123");
    expect(result.encrypted).toBe(true);
    expect(result.textEnc).toBe("cipher");
    expect(result._id).toBe("thread_2");
  });

  it("leaves text unchanged when thread is NOT encrypted", () => {
    const thread: Thread = {
      _id: "thread_3",
      type: "thread",
      text: "plaintext thread",
      done: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const result = withoutPlaintext(thread);
    expect(result.text).toBe("plaintext thread");
    expect(result).toBe(thread);
  });

  it("does not mutate the original thread", () => {
    const thread: Thread = {
      _id: "thread_4",
      type: "thread",
      text: "original",
      done: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      encrypted: true,
      textEnc: "cipher",
    };
    withoutPlaintext(thread);
    expect(thread.text).toBe("original");
  });

  it("is idempotent: calling twice produces same result", () => {
    const thread: Thread = {
      _id: "thread_5",
      type: "thread",
      text: "some text",
      done: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      encrypted: true,
      textEnc: "cipher",
    };
    const once = withoutPlaintext(thread);
    const twice = withoutPlaintext(once);
    expect(twice.text).toBe("");
  });
});

// ─── encrypt → withoutPlaintext → decrypt (update flow) ─────────────────────

describe("update-without-text-leak flow", () => {
  it("withoutPlaintext on a decrypted thread never leaks plaintext to DB", async () => {
    await setupKey();
    const encrypted = await encryptThread(baseThread({ text: "sensitive goal" })) as Thread;

    // Simulate decryption (UI has the thread in memory)
    const decrypted = await decryptThread(encrypted);
    expect(decrypted.text).toBe("sensitive goal");

    // Simulate a done-toggle update: strip plaintext before writing to DB
    const forDb = withoutPlaintext({ ...decrypted, done: true });
    expect(forDb.text).toBe("");
    expect(forDb.done).toBe(true);
    expect(forDb.textEnc).toBe(encrypted.textEnc);
  });

  it("text remains recoverable after a non-text update round-trip", async () => {
    const key = await setupKey();
    const encrypted = await encryptThread(baseThread({ text: "recoverable" })) as Thread;

    const decrypted = await decryptThread(encrypted);
    const forDb = withoutPlaintext({ ...decrypted, dueDate: "2026-12-31" });

    // Simulate re-loading from DB (forDb is what was persisted)
    clearKey();
    await storeKey(key);
    const reloaded = await decryptThread(forDb);
    expect(reloaded.text).toBe("recoverable");
    expect(reloaded.dueDate).toBe("2026-12-31");
  });
});
