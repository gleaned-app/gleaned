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

  const db = await getDB();
  setSyncStatus("syncing");
  _syncHandler = db
    .sync(syncUrl, { live: true, retry: true })
    .on("active",  () => setSyncStatus("syncing"))
    .on("paused",  (err) => setSyncStatus(err ? "error" : "synced"))
    .on("error",   () => setSyncStatus("error"))
    .on("denied",  () => setSyncStatus("error")) as PouchDB.Replication.Sync<AnyDoc>;
}
