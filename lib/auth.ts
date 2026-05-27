import { apiFetch, UnauthorizedError } from "./api-client";
import { getSettings, setDbAuthenticated } from "./db";
import {
  deriveKey, generateSalt, saltToBase64, base64ToSalt,
  encryptText, decryptText, storeKey, clearKey, PBKDF2_ITERATIONS,
} from "./crypto";

const VERIFICATION_PLAINTEXT = "gleaned-v1";
const LEGACY_PBKDF2_ITERATIONS = 200_000;

// In-memory auth state. Lost on page reload — intentional.
// The server session (HttpOnly cookie) survives the reload, but the AES
// encryption key does not, so the user must re-enter their password.
let _authenticated = false;

// Returns true if the server has a password verifier set up.
export async function hasPassword(): Promise<boolean> {
  try {
    const res = await apiFetch("/api/auth/status");
    const json = await res.json();
    if (json.setup) return true;
  } catch {
    // API unreachable — fall back to PouchDB settings
  }
  const settings = await getSettings();
  return !!settings?.encryptionSalt;
}

export async function setupPassword(password: string): Promise<void> {
  const salt = generateSalt();
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const encryptionSalt = saltToBase64(salt);

  await apiFetch("/api/auth/setup", {
    method: "POST",
    body: JSON.stringify({ password, encryptionSalt }),
  });

  await storeKey(key);
  _authenticated = true;
  setDbAuthenticated(true);
}

export async function login(password: string): Promise<boolean> {
  // Check if the server is set up. First-time logins after Phase 2 deploy
  // bootstrap the server verifier from the existing PouchDB settings.
  try {
    const statusRes = await apiFetch("/api/auth/status");
    const status = await statusRes.json();

    if (!status.setup) {
      return await _bootstrapFromPouchDB(password);
    }

    const loginRes = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });

    if (!loginRes.ok) return false;

    const { encryptionSalt, encryptionIterations } = await loginRes.json();
    const key = await deriveKey(
      password,
      base64ToSalt(encryptionSalt),
      encryptionIterations ?? PBKDF2_ITERATIONS,
    );
    await storeKey(key);
    _authenticated = true;
    setDbAuthenticated(true);
    return true;
  } catch (err) {
    if (err instanceof UnauthorizedError) return false;
    // Unexpected error — propagate
    throw err;
  }
}

// First login after Phase 2 deploy: verify password against PouchDB ciphertext,
// then bootstrap the server with the existing PBKDF2 salt.
async function _bootstrapFromPouchDB(password: string): Promise<boolean> {
  const settings = await getSettings();
  if (!settings?.encryptionSalt || !settings?.encryptionVerification) return false;

  const salt = base64ToSalt(settings.encryptionSalt);
  const iterations = settings.encryptionIterations ?? LEGACY_PBKDF2_ITERATIONS;
  const key = await deriveKey(password, salt, iterations);

  try {
    const check = await decryptText(key, settings.encryptionVerification);
    if (check !== VERIFICATION_PLAINTEXT) return false;

    if (iterations < PBKDF2_ITERATIONS) {
      // Upgrade iteration count while bootstrapping.
      const upgradedKey = await deriveKey(password, salt, PBKDF2_ITERATIONS);
      const newVerification = await encryptText(upgradedKey, VERIFICATION_PLAINTEXT);
      await import("./db").then(({ saveSettings }) =>
        saveSettings({ encryptionVerification: newVerification, encryptionIterations: PBKDF2_ITERATIONS }),
      );
      await storeKey(upgradedKey);
    } else {
      await storeKey(key);
    }
  } catch {
    return false;
  }

  // Bootstrap the server: store the Argon2id verifier and encryption salt.
  await apiFetch("/api/auth/setup", {
    method: "POST",
    body: JSON.stringify({ password, encryptionSalt: settings.encryptionSalt }),
  });

  _authenticated = true;
  setDbAuthenticated(true);
  return true;
}

export async function logout(): Promise<void> {
  _authenticated = false;
  clearKey();
  setDbAuthenticated(false);
  try {
    await apiFetch("/api/auth/logout", { method: "POST" });
  } catch {
    // Best-effort — local state is already cleared
  }
}

export function isAuthenticated(): boolean {
  return _authenticated;
}
