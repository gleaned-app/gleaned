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
    // Phase 5: one-time migration from PouchDB → SQLite (no-op after first run).
    // Wrapped in its own IIFE + try so a missing pouchdb package is silent.
    (async () => {
      try {
        const { migrateFromPouchDB } = await import("./pouchdb-migration");
        await migrateFromPouchDB();
      } catch {
        // PouchDB package removed or migration error — ignore
      }
    })();
  }
}
