import type { Entry } from "@/types/entry";
import type { Todo } from "@/types/todo";

export type AnyDoc = Entry | Todo;

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

// ─── DB singleton ─────────────────────────────────────────────────────────────

let _db: PouchDB.Database<AnyDoc> | null = null;

export async function getDB(): Promise<PouchDB.Database<AnyDoc>> {
  if (_db) return _db;

  const PouchDB = (await import("pouchdb")).default;
  const PouchDBFind = (await import("pouchdb-find")).default;
  PouchDB.plugin(PouchDBFind);

  _db = new PouchDB<AnyDoc>("gleaned");
  // pouchdb 9's isRemote() warns whenever typeof db.type === 'function'.
  // The IDB adapter assigns api.type = function(){...} asynchronously after construction,
  // so a plain value override gets clobbered. A getter/setter trap keeps type non-function
  // and swallows the adapter's assignment; isRemote() falls through to return false (= local).
  Object.defineProperty(_db, "type", { get: () => undefined, set: () => {}, configurable: true });
  await Promise.all([
    _db.createIndex({ index: { fields: ["type", "date", "createdAt"] } }),
    _db.createIndex({ index: { fields: ["type", "createdAt"] } }),
    _db.createIndex({ index: { fields: ["type", "nextReview"] } }),
  ]);

  return _db;
}
