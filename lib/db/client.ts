import type { Entry } from "@/types/entry";
import type { Thread } from "@/types/thread";

export type AnyDoc = Entry | Thread;

export const QUERY_METADATA_LIMIT = 5000;
export const QUERY_DECRYPT_LIMIT = 2000;
export const REVIEW_BACKFILL_CAP = 20;

export function toLocalDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Protects against corrupted DB documents instead of crashing the whole Promise.all
export function isEntry(doc: unknown): doc is Entry {
  return (
    !!doc &&
    typeof doc === "object" &&
    (doc as Record<string, unknown>).type === "entry" &&
    typeof (doc as Record<string, unknown>)._id === "string"
  );
}

// ─── Auth guard ──────────────────────────────────────────────────────────────
// Three-state guard:
//   "pending"       — initial state and after HMR module reset; requireAuth passes
//                     because no DB-using component is mounted before auth completes.
//   "authenticated" — set by auth.ts after successful login / setupPassword.
//   "locked"        — set by auth.ts on logout; requireAuth throws to block console access.
type DbAuthState = "pending" | "authenticated" | "locked";
let _dbAuthState: DbAuthState = "pending";

export function setAuthState(state: DbAuthState): void {
  _dbAuthState = state;
}

export function requireAuth(): void {
  if (_dbAuthState === "locked") throw new Error("gleaned: not authenticated");
}
