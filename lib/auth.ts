import { getSettings, saveSettings, setDbAuthenticated } from "./db";
import {
  deriveKey, generateSalt, saltToBase64, base64ToSalt,
  encryptText, decryptText, storeKey, clearKey,
} from "./crypto";

const VERIFICATION_PLAINTEXT = "gleaned-v1";

// Auth state lives only in memory — a page reload requires re-authentication.
// This is intentional: persisting auth state in sessionStorage would keep the
// session alive after a tab restore, which defeats the purpose of a lock screen.
//
// Threat model: this design protects against remote/network access and cross-origin
// JS. It does NOT protect against physical access to an unlocked device with an open
// tab — the AES key is in JS heap and the session is live. That is an accepted
// trade-off for a local-first app; users should lock (⌘L) before stepping away.
let _authenticated = false;

export async function hasPassword(): Promise<boolean> {
  const settings = await getSettings();
  return !!settings?.encryptionSalt;
}

export async function setupPassword(password: string): Promise<void> {
  const salt = generateSalt();
  const key = await deriveKey(password, salt);
  const verification = await encryptText(key, VERIFICATION_PLAINTEXT);
  await saveSettings({
    encryptionSalt: saltToBase64(salt),
    encryptionVerification: verification,
  });
  await storeKey(key);
  _authenticated = true;
  setDbAuthenticated(true);
}

export async function login(password: string): Promise<boolean> {
  const settings = await getSettings();
  if (!settings?.encryptionSalt || !settings?.encryptionVerification) return false;

  const salt = base64ToSalt(settings.encryptionSalt);
  const key = await deriveKey(password, salt);
  try {
    const check = await decryptText(key, settings.encryptionVerification);
    if (check !== VERIFICATION_PLAINTEXT) return false;
    await storeKey(key);
  } catch {
    return false;
  }

  _authenticated = true;
  setDbAuthenticated(true);
  return true;
}

export function logout(): void {
  _authenticated = false;
  clearKey();
  setDbAuthenticated(false);
}

export function isAuthenticated(): boolean {
  return _authenticated;
}
