import { getDB } from "./client";
import type { AnyDoc } from "./client";

export type SyncStatus = "idle" | "syncing" | "synced" | "error";

let _syncStatus: SyncStatus = "idle";
let _syncHandler: PouchDB.Replication.Sync<AnyDoc> | null = null;
const _syncListeners = new Set<(s: SyncStatus) => void>();

let _lastSynced: Date | null = null;
const _lastSyncedListeners = new Set<(d: Date | null) => void>();

// Debounce "synced" so PouchDB's rapid active→paused→active cycles during bulk
// syncs don't flicker the status dot amber↔green. Only emits "synced" after 450 ms
// of quiet. Any new event during that window cancels and reschedules.
let _syncedDebounce: ReturnType<typeof setTimeout> | null = null;

function setSyncStatus(s: SyncStatus) {
  if (_syncedDebounce) {
    clearTimeout(_syncedDebounce);
    _syncedDebounce = null;
  }

  if (s === "synced") {
    _syncedDebounce = setTimeout(() => {
      _syncedDebounce = null;
      _syncStatus = "synced";
      _lastSynced = new Date();
      _lastSyncedListeners.forEach((l) => l(_lastSynced));
      _syncListeners.forEach((l) => l("synced"));
    }, 450);
    return;
  }

  _syncStatus = s;
  _syncListeners.forEach((l) => l(s));
}

export function getSyncStatus(): SyncStatus { return _syncStatus; }
export function getLastSynced(): Date | null { return _lastSynced; }

export function subscribeSyncStatus(cb: (s: SyncStatus) => void): () => void {
  _syncListeners.add(cb);
  return () => _syncListeners.delete(cb);
}

export function subscribeLastSynced(cb: (d: Date | null) => void): () => void {
  _lastSyncedListeners.add(cb);
  return () => _lastSyncedListeners.delete(cb);
}

export function stopSync() {
  _syncHandler?.cancel();
  _syncHandler = null;
  setSyncStatus("idle");
}

// Cache the last URL+credentials that passed pre-flight validation. On app
// reload with unchanged settings we skip the round-trip entirely — sync starts
// immediately instead of waiting up to 3 s for the pre-flight.
let _validatedKey: string | null = null;

function credKey(url: string, username?: string, password?: string): string {
  return `${url}||${username ?? ""}||${password ?? ""}`;
}

function basicAuth(username: string, password: string): string {
  return "Basic " + btoa(unescape(encodeURIComponent(`${username.trim()}:${password}`)));
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
      headers["Authorization"] = basicAuth(username, password ?? "");
    }
    // 3 s is enough for a healthy server — 5 s caused noticeable startup lag.
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(3000) });
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
    headers["Authorization"] = basicAuth(username, password ?? "");
  }

  setSyncStatus("syncing");

  // Pre-flight: skip if URL+credentials already validated this session to avoid
  // a 3 s round-trip on every page reload with unchanged settings.
  const key = credKey(trimmed, username, password);
  if (key !== _validatedKey) {
    const valid = await isCouchDB(trimmed, username, password);
    if (!valid) {
      _validatedKey = null; // clear cache so next attempt re-validates
      setSyncStatus("error");
      return;
    }
    _validatedKey = key;
  }

  const db = await getDB();

  // PouchDB 9 dropped the legacy `ajax` adapter; the HTTP adapter only reads
  // `fetch` / `headers` from the *remote DB constructor* opts, not from
  // db.sync()'s opts. Passing a bare URL string to db.sync() builds a remote
  // PouchDB internally with no auth, so every replication request goes out
  // unauthenticated → 401. Fix: construct the remote DB ourselves with a
  // fetch override that injects the Authorization header on every request
  // (initial GET, _changes feed, _bulk_get, _local checkpoints, …).
  const PouchDB = (await import("pouchdb")).default;
  const remoteOpts: PouchDB.Configuration.RemoteDatabaseConfiguration =
    Object.keys(headers).length > 0
      ? {
          fetch: (url, opts) => {
            const init = opts ?? {};
            const merged = new Headers(init.headers as HeadersInit | undefined);
            for (const [k, v] of Object.entries(headers)) merged.set(k, v);
            return PouchDB.fetch(url, { ...init, headers: merged });
          },
        }
      : {};
  const remote = new PouchDB<AnyDoc>(trimmed, remoteOpts);

  _syncHandler = db
    .sync(remote, { live: true, retry: true })
    .on("active",  () => setSyncStatus("syncing"))
    .on("paused",  (err) => setSyncStatus(err ? "error" : "synced"))
    .on("error",   () => { _validatedKey = null; setSyncStatus("error"); })
    .on("denied",  () => { _validatedKey = null; setSyncStatus("error"); }) as PouchDB.Replication.Sync<AnyDoc>;
}
