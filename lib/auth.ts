import { getSettings, saveSettings, setDbAuthenticated } from "./db";
import {
  deriveKey, generateSalt, saltToBase64, base64ToSalt,
  encryptText, decryptText, storeKey, clearKey, PBKDF2_ITERATIONS,
} from "./crypto";

const VERIFICATION_PLAINTEXT = "gleaned-v1";
const LEGACY_PBKDF2_ITERATIONS = 200_000;

// Auth state lives only in memory — a page reload requires re-authentication.
// This is intentional: persisting auth state in sessionStorage would keep the
// session alive after a tab restore, which defeats the purpose of a lock screen.
//
// Threat model:
// - Protects against remote/network access and cross-origin JS.
// - Does NOT protect against physical access to an unlocked device with an open
//   tab — the AES key is in JS heap and the session is live. Users should lock
//   (⌘L) before stepping away.
// - Brute-force protection is enforced at the UI layer (LockScreen.tsx):
//   exponential backoff starting at 1 s, capped at 30 s, persisted in
//   sessionStorage so a page reload does not reset the counter.
let _authenticated = false;

export async function hasPassword(): Promise<boolean> {
  const settings = await getSettings();
  return !!settings?.encryptionSalt;
}

export async function setupPassword(password: string): Promise<void> {
  const salt = generateSalt();
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const verification = await encryptText(key, VERIFICATION_PLAINTEXT);
  await saveSettings({
    encryptionSalt: saltToBase64(salt),
    encryptionVerification: verification,
    encryptionIterations: PBKDF2_ITERATIONS,
  });
  await storeKey(key);
  _authenticated = true;
  setDbAuthenticated(true);
}

export async function login(password: string): Promise<boolean> {
  const settings = await getSettings();
  if (!settings?.encryptionSalt || !settings?.encryptionVerification) return false;

  const salt = base64ToSalt(settings.encryptionSalt);
  const storedIterations = settings.encryptionIterations ?? LEGACY_PBKDF2_ITERATIONS;
  const key = await deriveKey(password, salt, storedIterations);
  try {
    const check = await decryptText(key, settings.encryptionVerification);
    if (check !== VERIFICATION_PLAINTEXT) return false;

    if (storedIterations < PBKDF2_ITERATIONS) {
      // Silently upgrade PBKDF2 iteration count to current standard on next login.
      // The data itself is unaffected — only the key-derivation cost and the
      // verification ciphertext are updated.
      const upgradedKey = await deriveKey(password, salt, PBKDF2_ITERATIONS);
      const newVerification = await encryptText(upgradedKey, VERIFICATION_PLAINTEXT);
      await saveSettings({ encryptionVerification: newVerification, encryptionIterations: PBKDF2_ITERATIONS });
      await storeKey(upgradedKey);
    } else {
      await storeKey(key);
    }
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
