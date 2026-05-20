import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  deriveKey,
  generateSalt,
  saltToBase64,
  base64ToSalt,
  encryptText,
  decryptText,
  storeKey,
  loadKey,
  clearKey,
} from "./crypto";

// ─── sessionStorage mock ──────────────────────────────────────────────────────
// crypto.ts accesses sessionStorage for key persistence. Node has none.

const _store: Record<string, string> = {};

vi.stubGlobal("sessionStorage", {
  getItem: (k: string) => _store[k] ?? null,
  setItem: (k: string, v: string) => { _store[k] = v; },
  removeItem: (k: string) => { delete _store[k]; },
  clear: () => { Object.keys(_store).forEach((k) => delete _store[k]); },
});

beforeEach(() => {
  // Reset sessionStorage and the in-memory key cache between every test.
  sessionStorage.clear();
  clearKey();
});

// ─── saltToBase64 / base64ToSalt ──────────────────────────────────────────────

describe("saltToBase64 / base64ToSalt", () => {
  it("round-trips a 16-byte salt", () => {
    const salt = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(base64ToSalt(saltToBase64(salt))).toEqual(salt);
  });

  it("round-trips all-zero bytes", () => {
    const salt = new Uint8Array(16);
    expect(base64ToSalt(saltToBase64(salt))).toEqual(salt);
  });

  it("round-trips all-max bytes (255)", () => {
    const salt = new Uint8Array(16).fill(255);
    expect(base64ToSalt(saltToBase64(salt))).toEqual(salt);
  });

  it("produces a non-empty base64 string", () => {
    const salt = generateSalt();
    const b64 = saltToBase64(salt);
    expect(typeof b64).toBe("string");
    expect(b64.length).toBeGreaterThan(0);
  });

  it("different salts produce different base64", () => {
    const a = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const b = new Uint8Array([16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(saltToBase64(a)).not.toBe(saltToBase64(b));
  });
});

// ─── generateSalt ────────────────────────────────────────────────────────────

describe("generateSalt", () => {
  it("returns a Uint8Array of exactly 16 bytes", () => {
    const salt = generateSalt();
    expect(salt).toBeInstanceOf(Uint8Array);
    expect(salt.length).toBe(16);
  });

  it("produces unique values on each call", () => {
    const salts = Array.from({ length: 10 }, () => saltToBase64(generateSalt()));
    const unique = new Set(salts);
    expect(unique.size).toBe(10);
  });
});

// ─── deriveKey ───────────────────────────────────────────────────────────────

describe("deriveKey", () => {
  it("returns a CryptoKey", async () => {
    const salt = generateSalt();
    const key = await deriveKey("password", salt);
    expect(key).toBeTruthy();
    expect(key.type).toBe("secret");
    expect(key.algorithm.name).toBe("AES-GCM");
  });

  it("is deterministic: same password + salt produces equivalent key", async () => {
    const salt = generateSalt();
    const key1 = await deriveKey("mypassword", salt);
    const key2 = await deriveKey("mypassword", salt);
    const ciphertext = await encryptText(key1, "test");
    // key2 derived from the same inputs must decrypt what key1 encrypted
    await expect(decryptText(key2, ciphertext)).resolves.toBe("test");
  });

  it("different password → cannot decrypt", async () => {
    const salt = generateSalt();
    const key1 = await deriveKey("correctpassword", salt);
    const key2 = await deriveKey("wrongpassword", salt);
    const ciphertext = await encryptText(key1, "secret");
    await expect(decryptText(key2, ciphertext)).rejects.toThrow();
  });

  it("different salt → cannot decrypt", async () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();
    const key1 = await deriveKey("password", salt1);
    const key2 = await deriveKey("password", salt2);
    const ciphertext = await encryptText(key1, "secret");
    await expect(decryptText(key2, ciphertext)).rejects.toThrow();
  });

  it("accepts empty password", async () => {
    const salt = generateSalt();
    const key = await deriveKey("", salt);
    expect(key).toBeTruthy();
  });

  it("accepts unicode password", async () => {
    const salt = generateSalt();
    const key = await deriveKey("Passwörter🔐", salt);
    const ciphertext = await encryptText(key, "data");
    await expect(decryptText(key, ciphertext)).resolves.toBe("data");
  });
});

// ─── encryptText / decryptText ────────────────────────────────────────────────

async function freshKey(): Promise<CryptoKey> {
  return deriveKey("testpassword", generateSalt());
}

describe("encryptText / decryptText", () => {
  it("round-trip: decrypt returns original plaintext", async () => {
    const key = await freshKey();
    const ciphertext = await encryptText(key, "hello gleaned");
    expect(await decryptText(key, ciphertext)).toBe("hello gleaned");
  });

  it("round-trip: empty string", async () => {
    const key = await freshKey();
    const ciphertext = await encryptText(key, "");
    expect(await decryptText(key, ciphertext)).toBe("");
  });

  it("round-trip: German umlauts and special chars", async () => {
    const key = await freshKey();
    const text = "Ärger über Überraschungen — Straßenbahn fährt nicht.";
    expect(await decryptText(key, await encryptText(key, text))).toBe(text);
  });

  it("round-trip: emoji and unicode", async () => {
    const key = await freshKey();
    const text = "Heute gelernt: 🧠💡 → Wissen bleibt hängen";
    expect(await decryptText(key, await encryptText(key, text))).toBe(text);
  });

  it("round-trip: multiline with newlines", async () => {
    const key = await freshKey();
    const text = "Zeile 1\nZeile 2\n\nZeile 4 nach Leerzeile";
    expect(await decryptText(key, await encryptText(key, text))).toBe(text);
  });

  it("round-trip: large text (10 KB)", async () => {
    const key = await freshKey();
    const text = "a".repeat(10_000);
    expect(await decryptText(key, await encryptText(key, text))).toBe(text);
  });

  it("round-trip: JSON payload (as used in encryptEntry)", async () => {
    const key = await freshKey();
    const payload = JSON.stringify({ content: "learned something", tags: ["js", "crypto"], attachments: [] });
    expect(await decryptText(key, await encryptText(key, payload))).toBe(payload);
  });

  it("produces different ciphertext on each call (random IV)", async () => {
    const key = await freshKey();
    const c1 = await encryptText(key, "same plaintext");
    const c2 = await encryptText(key, "same plaintext");
    expect(c1).not.toBe(c2);
  });

  it("ciphertext is a non-empty base64 string", async () => {
    const key = await freshKey();
    const ciphertext = await encryptText(key, "test");
    expect(typeof ciphertext).toBe("string");
    expect(ciphertext.length).toBeGreaterThan(0);
    expect(() => atob(ciphertext)).not.toThrow();
  });

  it("throws when decrypting with a different key", async () => {
    const key1 = await freshKey();
    const key2 = await freshKey();
    const ciphertext = await encryptText(key1, "secret");
    await expect(decryptText(key2, ciphertext)).rejects.toThrow();
  });

  it("throws when ciphertext is tampered (bit flip in payload)", async () => {
    const key = await freshKey();
    const ciphertext = await encryptText(key, "original");
    // Decode, flip a byte in the ciphertext portion (after 12-byte IV), re-encode
    const bytes = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
    bytes[20] ^= 0xff; // flip a byte well into the ciphertext
    const tampered = btoa(String.fromCharCode(...bytes));
    await expect(decryptText(key, tampered)).rejects.toThrow();
  });

  it("throws when ciphertext is truncated to less than 12 bytes (no IV)", async () => {
    const key = await freshKey();
    // 11 bytes encoded as base64 — not enough for a 12-byte IV
    const truncated = btoa(String.fromCharCode(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10));
    await expect(decryptText(key, truncated)).rejects.toThrow();
  });

  it("throws when ciphertext is exactly 12 bytes (IV only, no ciphertext body)", async () => {
    const key = await freshKey();
    const ivOnly = btoa(String.fromCharCode(...new Uint8Array(12)));
    await expect(decryptText(key, ivOnly)).rejects.toThrow();
  });

  it("throws on invalid base64 input", async () => {
    const key = await freshKey();
    await expect(decryptText(key, "this is not base64!!!")).rejects.toThrow();
  });

  it("throws on empty string input", async () => {
    const key = await freshKey();
    await expect(decryptText(key, "")).rejects.toThrow();
  });

  it("throws when IV is valid but auth tag is tampered", async () => {
    const key = await freshKey();
    const ciphertext = await encryptText(key, "data");
    const bytes = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
    // Tamper the last byte (end of GCM auth tag)
    bytes[bytes.length - 1] ^= 0x01;
    const tampered = btoa(String.fromCharCode(...bytes));
    await expect(decryptText(key, tampered)).rejects.toThrow();
  });
});

// ─── storeKey / loadKey / clearKey ───────────────────────────────────────────

describe("storeKey / loadKey / clearKey", () => {
  it("loadKey returns null when nothing is stored", async () => {
    expect(await loadKey()).toBeNull();
  });

  it("storeKey then loadKey returns the cached key", async () => {
    const key = await deriveKey("password", generateSalt());
    const plaintext = "stored key test";
    const ciphertext = await encryptText(key, plaintext);

    await storeKey(key);

    const loaded = await loadKey();
    expect(loaded).not.toBeNull();
    expect(await decryptText(loaded!, ciphertext)).toBe(plaintext);
  });

  it("loadKey reloads from sessionStorage when in-memory cache is gone (simulates page reload)", async () => {
    // Manually export a key and write to sessionStorage to simulate a page reload
    // where _keyCache is null but sessionStorage still holds the JWK.
    const key = await deriveKey("password", generateSalt());
    const jwk = await crypto.subtle.exportKey("jwk", key);
    sessionStorage.setItem("gleaned_enc_key", JSON.stringify(jwk));
    // _keyCache is already null (clearKey called in beforeEach)

    const loaded = await loadKey();
    expect(loaded).not.toBeNull();

    const plaintext = "after reload";
    const ciphertext = await encryptText(key, plaintext);
    expect(await decryptText(loaded!, ciphertext)).toBe(plaintext);
  });

  it("loadKey uses in-memory cache (returns same object after storeKey)", async () => {
    const key = await deriveKey("password", generateSalt());
    await storeKey(key);
    const a = await loadKey();
    const b = await loadKey();
    expect(a).toBe(b); // strict reference equality — from cache
  });

  it("clearKey removes from in-memory cache and sessionStorage", async () => {
    const key = await deriveKey("password", generateSalt());
    await storeKey(key);
    clearKey();
    expect(await loadKey()).toBeNull();
    expect(sessionStorage.getItem("gleaned_enc_key")).toBeNull();
  });

  it("loadKey returns null after clearKey even if sessionStorage had a value", async () => {
    const key = await deriveKey("pw", generateSalt());
    await storeKey(key);
    clearKey();
    // Confirm sessionStorage was also cleared
    expect(await loadKey()).toBeNull();
  });

  it("loadKey returns null when sessionStorage contains invalid JSON", async () => {
    sessionStorage.setItem("gleaned_enc_key", "not-valid-json{{{");
    expect(await loadKey()).toBeNull();
  });

  it("loadKey returns null when sessionStorage contains valid JSON but invalid JWK", async () => {
    sessionStorage.setItem("gleaned_enc_key", JSON.stringify({ kty: "oct", k: "invalid" }));
    expect(await loadKey()).toBeNull();
  });
});
