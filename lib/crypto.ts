// AES-GCM encryption with PBKDF2 key derivation.
// The derived key is kept only in the module-level cache for the lifetime of the
// JS process. It is never written to sessionStorage or any persistent store —
// meaning a page reload requires re-authentication. This is intentional: storing
// the JWK in sessionStorage exposes it to any same-origin JS (extensions, XSS).

let _keyCache: CryptoKey | null = null;

export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations: 200_000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

export function saltToBase64(salt: Uint8Array): string {
  return bytesToBase64(salt);
}

export function base64ToSalt(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// Stack-overflow-safe base64 encoder — avoids spreading large Uint8Arrays into
// String.fromCharCode, which throws a RangeError for arrays larger than ~65k bytes.
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 32_768;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function encryptText(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), 12);
  return bytesToBase64(combined);
}

export async function decryptText(key: CryptoKey, ciphertext: string): Promise<string> {
  const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: combined.slice(0, 12) },
    key,
    combined.slice(12),
  );
  return new TextDecoder().decode(plain);
}

// Binary equivalents of encryptText/decryptText for attachment data.
// Input/output is raw binary (ArrayBuffer), not text — no TextEncoder involved.
export async function encryptBytes(key: CryptoKey, data: ArrayBuffer): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), 12);
  return bytesToBase64(combined);
}

export async function decryptBytes(key: CryptoKey, b64: string): Promise<ArrayBuffer> {
  const combined = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: combined.slice(0, 12) },
    key,
    combined.slice(12),
  );
}

export async function storeKey(key: CryptoKey): Promise<void> {
  _keyCache = key;
}

export async function loadKey(): Promise<CryptoKey | null> {
  return _keyCache;
}

export function clearKey(): void {
  _keyCache = null;
}
