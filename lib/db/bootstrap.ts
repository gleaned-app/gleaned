import { getDB } from "./client";
import type { AnyDoc } from "./client";

export type BootstrapResult = "ok" | "not-found" | "auth-error" | "network-error";

/**
 * Pulls gleaned_settings from a remote CouchDB instance and stores it locally.
 *
 * This is a one-time, single-doc fetch — not a full sync. It lets a new device
 * derive the correct AES key (via the stored salt) without having to re-register
 * and generate a conflicting salt. Full live sync starts automatically after the
 * user logs in with the app password (same flow as a normal login).
 *
 * Returns:
 *   "ok"            — settings doc found and stored locally
 *   "not-found"     — server reachable but no gleaned account exists there
 *   "auth-error"    — wrong CouchDB credentials (401/403)
 *   "network-error" — server unreachable, invalid URL, or unexpected HTTP error
 */
export async function bootstrapFromCouchDB(
  url: string,
  username: string,
  password: string,
): Promise<BootstrapResult> {
  const trimmed = url.trim().replace(/\/$/, "");
  if (!trimmed) return "network-error";

  let fetchUrl: string;
  const headers: Record<string, string> = {};
  try {
    fetchUrl = new URL(`${trimmed}/gleaned_settings`).toString();
    if (username.trim()) {
      headers["Authorization"] = "Basic " + btoa(`${username.trim()}:${password.trim()}`);
    }
  } catch {
    return "network-error";
  }

  let doc: Record<string, unknown>;
  try {
    const res = await fetch(fetchUrl, { headers });
    if (res.status === 401 || res.status === 403) return "auth-error";
    if (res.status === 404) return "not-found";
    if (!res.ok) return "network-error";
    doc = await res.json() as Record<string, unknown>;
  } catch {
    return "network-error";
  }

  // A valid gleaned account always has an encryptionSalt.
  if (!doc.encryptionSalt) return "not-found";

  // Strip the remote _rev so PouchDB treats this as a new local document.
  const { _rev: _ignored, ...docWithoutRev } = doc;
  const db = await getDB();
  try {
    await db.put({ ...docWithoutRev, _id: "gleaned_settings" } as unknown as AnyDoc);
  } catch (err: unknown) {
    if ((err as { status?: number }).status === 409) {
      // Partial local doc exists — overwrite it with the remote version.
      const existing = await db.get("gleaned_settings");
      await db.put({ ...docWithoutRev, _id: "gleaned_settings", _rev: existing._rev } as unknown as AnyDoc);
    } else {
      return "network-error";
    }
  }

  return "ok";
}
