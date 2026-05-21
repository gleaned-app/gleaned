import { getSettings, saveSettings } from "./db";
import {
  deriveKey, generateSalt, saltToBase64, base64ToSalt,
  encryptText, decryptText, storeKey, clearKey,
} from "./crypto";

const SESSION_KEY = "gleaned_session";
const VERIFICATION_PLAINTEXT = "gleaned-v1";

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
  sessionStorage.setItem(SESSION_KEY, "1");
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
