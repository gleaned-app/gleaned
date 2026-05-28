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
