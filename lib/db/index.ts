export * from "./client";
export * from "./entry-crypto";
export * from "./thread-crypto";
export * from "./entries";
export * from "./threads";
export * from "./review";
export * from "./settings";
export * from "./data";

import { setAuthState } from "./client";
import { invalidateSearchCache } from "./entries";
import { migrateThreadsEncryption } from "./threads";

export function setDbAuthenticated(authenticated: boolean): void {
  setAuthState(authenticated ? "authenticated" : "locked");
  if (!authenticated) invalidateSearchCache();
  if (authenticated) {
    migrateThreadsEncryption().catch(() => {});
  }
}

// ─── Stubs for removed CouchDB/PouchDB modules ───────────────────────────────
// These will be deleted in Phase 6 along with the components that use them.

export type SyncStatus = "idle" | "syncing" | "synced" | "error";
export type BootstrapResult = "ok" | "not-found" | "auth-error" | "network-error";

export interface ConflictDoc {
  winner: import("@/types/entry").Entry;
  alternatives: import("@/types/entry").Entry[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function startSync(..._args: unknown[]): void {}
export function stopSync(): void {}
export function getSyncStatus(): SyncStatus { return "idle"; }
export function subscribeSyncStatus(cb: (s: SyncStatus) => void): () => void {
  void cb;
  return () => {};
}
export function getLastSynced(): Date | null { return null; }
export function subscribeLastSynced(cb: (d: Date | null) => void): () => void {
  void cb;
  return () => {};
}
export async function getConflicts(): Promise<ConflictDoc[]> { return []; }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function resolveConflict(..._args: unknown[]): Promise<void> {}
export async function bootstrapFromCouchDB(..._args: unknown[]): Promise<BootstrapResult> {
  return "not-found";
}
