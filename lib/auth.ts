import { apiFetch, UnauthorizedError } from "./api-client";
import { setDbAuthenticated } from "./db";
import {
  deriveKey, generateSalt, saltToBase64, base64ToSalt,
  storeKey, clearKey, PBKDF2_ITERATIONS,
} from "./crypto";

// In-memory auth state. Lost on page reload — intentional.
// The server session (HttpOnly cookie) survives the reload, but the AES
// encryption key does not, so the user must re-enter their password.
let _authenticated = false;

// Returns true if the server has a password verifier set up.
export async function hasPassword(): Promise<boolean> {
  try {
    const res = await apiFetch("/api/auth/status");
    const json = await res.json();
    return !!json.setup;
  } catch {
    return false;
  }
}

export async function setupPassword(password: string, setupToken: string): Promise<void> {
  const salt = generateSalt();
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const encryptionSalt = saltToBase64(salt);

  await apiFetch("/api/auth/setup", {
    method: "POST",
    body: JSON.stringify({ password, encryptionSalt, setupToken }),
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

    if (!status.setup) return false;

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
