export * from "./client";
export * from "./sync";
export * from "./bootstrap";
export * from "./entry-crypto";
export * from "./thread-crypto";
export * from "./entries";
export * from "./threads";
export * from "./review";
export * from "./settings";
export * from "./conflicts";
export * from "./data";

import { setAuthState } from "./client";
import { invalidateSearchCache } from "./entries";
import { migrateThreadsEncryption } from "./threads";
import { migrateAttachmentsToNative } from "./migrations";

// Orchestrates auth state + post-login migrations. Called by auth.ts on every
// login/logout — lives here (not in client.ts) to avoid circular imports between
// client.ts → todos/migrations → client.ts.
export function setDbAuthenticated(authenticated: boolean): void {
  setAuthState(authenticated ? "authenticated" : "locked");
  if (!authenticated) invalidateSearchCache();
  if (authenticated) {
    migrateThreadsEncryption().catch(() => {});
    migrateAttachmentsToNative().catch(() => {});
  }
}
