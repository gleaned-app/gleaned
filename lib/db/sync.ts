import { getDB } from "./client";
import type { AnyDoc } from "./client";

export type SyncStatus = "idle" | "syncing" | "synced" | "error";

let _syncStatus: SyncStatus = "idle";
let _syncHandler: PouchDB.Replication.Sync<AnyDoc> | null = null;
const _syncListeners = new Set<(s: SyncStatus) => void>();

function setSyncStatus(s: SyncStatus) {
  _syncStatus = s;
  _syncListeners.forEach((l) => l(s));
}

export function getSyncStatus(): SyncStatus { return _syncStatus; }

export function subscribeSyncStatus(cb: (s: SyncStatus) => void): () => void {
  _syncListeners.add(cb);
  return () => _syncListeners.delete(cb);
}

export function stopSync() {
  _syncHandler?.cancel();
  _syncHandler = null;
  setSyncStatus("idle");
}

/**
 * Verifies that a URL points to a real CouchDB database by checking for the
 * db_name field in the JSON response. Guards against false-green sync status
 * when an HTTP server (e.g. the Next.js dev server) returns 200 for any path.
 */
async function isCouchDB(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const json = await res.json() as Record<string, unknown>;
    return typeof json.db_name === "string";
  } catch {
    return false;
  }
}

export async function startSync(url: string, username?: string, password?: string) {
  stopSync();
  const trimmed = url.trim();
  if (!trimmed) return;

  let syncUrl = trimmed;
  if (username?.trim()) {
    try {
      const parsed = new URL(trimmed);
      parsed.username = encodeURIComponent(username.trim());
      parsed.password = encodeURIComponent(password?.trim() ?? "");
      syncUrl = parsed.toString();
    } catch { /* invalid URL — use as-is */ }
  }

  // Pre-flight: reject non-CouchDB endpoints before starting live sync.
  // Prevents false-green status when any HTTP 200 server is entered as URL.
  setSyncStatus("syncing");
  const valid = await isCouchDB(syncUrl);
  if (!valid) { setSyncStatus("error"); return; }

  const db = await getDB();
  _syncHandler = db
    .sync(syncUrl, { live: true, retry: true })
    .on("active",  () => setSyncStatus("syncing"))
    .on("paused",  (err) => setSyncStatus(err ? "error" : "synced"))
    .on("error",   () => setSyncStatus("error"))
    .on("denied",  () => setSyncStatus("error")) as PouchDB.Replication.Sync<AnyDoc>;
}
