import { getSettings, saveSettings } from "./db";
import {
  deriveKey, generateSalt, saltToBase64, base64ToSalt,
  encryptText, decryptText, storeKey, clearKey,
} from "./crypto";

const SESSION_KEY = "gleaned_session";
const VERIFICATION_PLAINTEXT = "gleaned-v1";

async function sha256(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const buffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hasPassword(): Promise<boolean> {
  const settings = await getSettings();
  return !!settings?.passwordHash;
}

export async function setupPassword(password: string): Promise<void> {
  const hash = await sha256(password);
  const salt = generateSalt();
  const key = await deriveKey(password, salt);
  const verification = await encryptText(key, VERIFICATION_PLAINTEXT);
  await saveSettings({
    passwordHash: hash,
    encryptionSalt: saltToBase64(salt),
    encryptionVerification: verification,
  });
  await storeKey(key);
  sessionStorage.setItem(SESSION_KEY, "1");
}

export async function login(password: string): Promise<boolean> {
  const settings = await getSettings();
  if (!settings?.passwordHash) return false;

  const hash = await sha256(password);
  if (hash !== settings.passwordHash) return false;

  // Derive key and verify it decrypts correctly
  if (settings.encryptionSalt && settings.encryptionVerification) {
    const salt = base64ToSalt(settings.encryptionSalt);
    const key = await deriveKey(password, salt);
    try {
      const check = await decryptText(key, settings.encryptionVerification);
      if (check !== VERIFICATION_PLAINTEXT) return false;
      await storeKey(key);
    } catch {
      return false;
    }
  }

  sessionStorage.setItem(SESSION_KEY, "1");
  return true;
}

export function logout(): void {
  sessionStorage.removeItem(SESSION_KEY);
  clearKey();
}

export function isAuthenticated(): boolean {
  return sessionStorage.getItem(SESSION_KEY) === "1";
}
