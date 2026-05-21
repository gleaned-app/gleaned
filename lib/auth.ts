import { getSettings, saveSettings } from "./db";
import {
  deriveKey, generateSalt, saltToBase64, base64ToSalt,
  encryptText, decryptText, storeKey, clearKey,
} from "./crypto";

const VERIFICATION_PLAINTEXT = "gleaned-v1";

// Auth state lives only in memory — a page reload requires re-authentication.
// This is intentional: persisting auth state in sessionStorage would keep the
// session alive after a tab restore, which defeats the purpose of a lock screen.
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
  return true;
}

export function logout(): void {
  _authenticated = false;
  clearKey();
}

export function isAuthenticated(): boolean {
  return _authenticated;
}
