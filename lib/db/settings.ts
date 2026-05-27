import { apiFetch } from "../api-client";

export interface Settings {
  language?: "de" | "en";
  weekStart?: "monday" | "sunday";
  theme?: "system" | "light" | "dark" | "sepia";
  bodyFont?: "sans" | "serif" | "playfair" | "handwriting";
  defaultView?: "journal" | "calendar" | "threads" | "review";
  autoLockAfter?: number;
  customEntryTypes?: string[];
  contextSources?: string[];
  // Kept for backward compat with settings-context.tsx until Phase 6 cleanup.
  // These are not persisted server-side — they resolve to empty strings.
  couchdbUrl?: string;
  couchdbUsername?: string;
  couchdbPassword?: string;
}

export async function getSettings(): Promise<Settings | null> {
  try {
    const res = await apiFetch("/api/settings");
    if (!res.ok) return null;
    return await res.json() as Settings;
  } catch {
    return null;
  }
}

export async function saveSettings(data: Partial<Settings>): Promise<void> {
  // CouchDB fields are not handled by the API; drop them before sending.
  // The API's toDb() would silently ignore them, but if they're the only
  // fields the server returns 400 ("No valid fields to update").
  const { couchdbUrl: _u, couchdbUsername: _n, couchdbPassword: _p, ...apiData } = data;
  if (Object.keys(apiData).length === 0) return;
  await apiFetch("/api/settings", { method: "PUT", body: JSON.stringify(apiData) });
}
