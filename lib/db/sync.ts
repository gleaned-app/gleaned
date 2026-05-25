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
async function isCouchDB(url: string, username?: string, password?: string): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    if (username?.trim()) {
      headers["Authorization"] = "Basic " + btoa(`${username.trim()}:${password ?? ""}`);
    }
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
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

  // Never embed credentials in the URL — Chrome 130+ blocks fetch() with URL
  // credentials for subresource requests. Pass via Authorization header instead.
  const headers: Record<string, string> = {};
  if (username?.trim()) {
    headers["Authorization"] = "Basic " + btoa(`${username.trim()}:${password ?? ""}`);
  }

  // Pre-flight: reject non-CouchDB endpoints before starting live sync.
  // Prevents false-green status when any HTTP 200 server is entered as URL.
  setSyncStatus("syncing");
  const valid = await isCouchDB(trimmed, username, password);
  if (!valid) { setSyncStatus("error"); return; }

  const db = await getDB();
  // PouchDB's TypeScript types don't expose ajax.headers on SyncOptions but the
  // HTTP adapter reads and forwards it for every request including _changes feed.
  const syncOpts = {
    live: true,
    retry: true,
    ...(Object.keys(headers).length > 0 ? { ajax: { headers } } : {}),
  } as PouchDB.Replication.SyncOptions;
  _syncHandler = db
    .sync(trimmed, syncOpts)
    .on("active",  () => setSyncStatus("syncing"))
    .on("paused",  (err) => setSyncStatus(err ? "error" : "synced"))
    .on("error",   () => setSyncStatus("error"))
    .on("denied",  () => setSyncStatus("error")) as PouchDB.Replication.Sync<AnyDoc>;
}
