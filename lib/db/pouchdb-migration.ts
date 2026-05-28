// One-time migration of PouchDB (IndexedDB) data to the server SQLite store.
// Runs fire-and-forget after the first successful login post-Phase 4 upgrade.
// See docs/migration-plan-pouchdb-to-sqlite.md § Phase 5 for the full spec.
//
// Invariant: localStorage["gleaned-migrated-v1"] === "done" means the migration
// completed successfully and this module becomes a no-op on subsequent logins.

import type { Entry } from "@/types/entry";
import type { Thread } from "@/types/thread";
import { decryptEntry, encryptEntryToApi } from "./entry-crypto";
import { decryptThread, encryptThreadToApi } from "./thread-crypto";
import { apiFetch } from "../api-client";
import { saveSettings, type Settings } from "./settings";

const MIGRATION_DONE_KEY = "gleaned-migrated-v1";

export async function migrateFromPouchDB(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    if (localStorage.getItem(MIGRATION_DONE_KEY) === "done") return;
  } catch {
    return; // localStorage unavailable — skip silently
  }

  try {
    await runMigration();
    localStorage.setItem(MIGRATION_DONE_KEY, "done");
    // Clean up the IndexedDB database now that data is on the server.
    indexedDB.deleteDatabase("gleaned");
    indexedDB.deleteDatabase("_pouch_gleaned");
  } catch (err) {
    // Will retry on next login — do not surface to the user
    console.error("[gleaned] PouchDB migration failed, will retry:", err);
  }
}

async function runMigration(): Promise<void> {
  // PouchDB is browser-only. Dynamic import keeps it out of the server bundle.
  // webpackIgnore + turbopackIgnore: tell the bundler not to resolve these modules at build
  // time. They no longer exist in node_modules; the import will throw at runtime, which is
  // caught by the try-catch in setDbAuthenticated — the migration is silently skipped.
  // @ts-expect-error — pouchdb package removed in Phase 6
  const PouchDB = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "pouchdb")).default as new (name: string) => {
    allDocs(opts: Record<string, unknown>): Promise<{ rows: { doc?: Record<string, unknown> }[] }>;
  };
  // @ts-expect-error — pouchdb-find removed along with pouchdb
  const PouchDBFind = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "pouchdb-find")).default as { default: unknown };
  (PouchDB as unknown as { plugin(p: unknown): void }).plugin(PouchDBFind);

  // Open the existing local database (read-only intent; we never write back).
  // If the DB never existed, PouchDB creates an empty one — allDocs returns 0 rows.
  const db = new PouchDB("gleaned");

  // Fetch all documents including encrypted binary _attachments.
  const result = await db.allDocs({
    include_docs: true,
    attachments: true,
  } as Parameters<typeof db.allDocs>[0]);

  // Partition by document type
  const rawEntries: Record<string, unknown>[] = [];
  const rawThreads: Record<string, unknown>[] = [];
  let rawSettings: Record<string, unknown> | null = null;

  for (const row of result.rows) {
    const doc = row.doc as Record<string, unknown> | undefined;
    if (!doc) continue;
    if (doc.type === "entry")         rawEntries.push(doc);
    else if (doc.type === "thread")   rawThreads.push(doc);
    else if (doc._id === "gleaned_settings") rawSettings = doc;
  }

  if (rawEntries.length === 0 && rawThreads.length === 0 && !rawSettings) return;

  // ── Entries ────────────────────────────────────────────────────────────────

  const apiEntries = (await Promise.allSettled(
    rawEntries.map(async (raw) => {
      // decryptEntry handles both encrypted and plain (pre-password) entries.
      const decrypted = await decryptEntry(raw as unknown as Entry);
      // Strip PouchDB-specific fields before re-encrypting.
      const { _rev: _r, encrypted: _e, enc: _c, ...base } = decrypted as Entry & {
        _rev?: string;
        encrypted?: boolean;
        enc?: string;
      };
      return encryptEntryToApi(base);
    }),
  )).flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));

  // ── Threads ────────────────────────────────────────────────────────────────

  const apiThreads = (await Promise.allSettled(
    rawThreads.map(async (raw) => {
      const decrypted = await decryptThread(raw as unknown as Thread);
      const { _rev: _r, encrypted: _e, textEnc: _t, ...base } = decrypted as Thread & {
        _rev?: string;
        encrypted?: boolean;
        textEnc?: string;
      };
      return encryptThreadToApi(base);
    }),
  )).flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));

  // ── POST to server (batch, idempotent upsert) ─────────────────────────────

  if (apiEntries.length > 0 || apiThreads.length > 0) {
    await apiFetch("/api/import", {
      method: "POST",
      body: JSON.stringify({ entries: apiEntries, threads: apiThreads }),
    });
  }

  // ── User preferences ───────────────────────────────────────────────────────
  // Migrate UI preferences from the PouchDB settings doc.
  // Auth fields (encryptionSalt, encryptionVerification) are already handled
  // server-side and must not be sent here.

  if (rawSettings) {
    const s = rawSettings;
    const prefs: Partial<Settings> = {};

    if (s.language === "de" || s.language === "en")
      prefs.language = s.language;
    if (s.weekStart === "monday" || s.weekStart === "sunday")
      prefs.weekStart = s.weekStart;
    if (["system", "light", "dark", "sepia"].includes(s.theme as string))
      prefs.theme = s.theme as Settings["theme"];
    if (["sans", "serif", "playfair", "handwriting"].includes(s.bodyFont as string))
      prefs.bodyFont = s.bodyFont as Settings["bodyFont"];
    if (["journal", "calendar", "threads", "review"].includes(s.defaultView as string))
      prefs.defaultView = s.defaultView as Settings["defaultView"];
    if (Array.isArray(s.customEntryTypes))
      prefs.customEntryTypes = s.customEntryTypes as string[];
    if (Array.isArray(s.contextSources))
      prefs.contextSources = s.contextSources as string[];
    if (typeof s.autoLockAfter === "number")
      prefs.autoLockAfter = s.autoLockAfter;

    if (Object.keys(prefs).length > 0) {
      await saveSettings(prefs);
    }
  }
}
