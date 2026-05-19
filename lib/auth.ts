import { getSettings, saveSettings } from "./db";

const SESSION_KEY = "gleaned_session";

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
  await saveSettings({ passwordHash: hash });
  sessionStorage.setItem(SESSION_KEY, "1");
}

export async function login(password: string): Promise<boolean> {
  const settings = await getSettings();
  if (!settings?.passwordHash) return false;
  const hash = await sha256(password);
  if (hash === settings.passwordHash) {
    sessionStorage.setItem(SESSION_KEY, "1");
    return true;
  }
  return false;
}

export function logout(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export async function isAuthenticated(): Promise<boolean> {
  if (sessionStorage.getItem(SESSION_KEY) === "1") return true;
  const hasPw = await hasPassword();
  if (!hasPw) {
    sessionStorage.setItem(SESSION_KEY, "1");
    return true;
  }
  return false;
}
