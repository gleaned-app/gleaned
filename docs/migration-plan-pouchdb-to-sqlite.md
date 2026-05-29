# Migration Plan: PouchDB/CouchDB → SQLite + Next.js API

**Date:** 2026-05-27
**Completed:** 2026-05-29
**Status:** Completed
**Relates to:** [Architecture Decision: Storage Layer](./architecture-decision-storage.md)

---

## Overview

This document describes the step-by-step migration of gleaned's storage layer
from PouchDB (IndexedDB in the browser) + CouchDB (sync server) to a
server-side SQLite database accessed through Next.js API routes.

The migration is designed so that:
- **`components/`** changes as little as possible — public function signatures
  in `lib/db/*` stay identical so the UI layer does not need a rewrite (but
  see "Loading & Error States" below — there is unavoidable work)
- **`lib/crypto.ts`** is completely unchanged — the client-side E2E encryption
  model is preserved
- **Each phase is independently deployable** — no big-bang cutover
- **Existing user data is migrated** automatically on first login after the
  update, with the old PouchDB store retained until the migration is verified

---

## Current State

```
Browser (IndexedDB)
  └── PouchDB
        └── live bidirectional sync
              └── CouchDB (Docker container)
```

- `lib/db/` contains all data access: PouchDB queries, CouchDB sync, conflict handling
- `lib/crypto.ts` derives the encryption key (PBKDF2) and encrypts entry
  content + thread text before writing to PouchDB
- Components call functions from `lib/db/` directly — no API layer
- `next.config.ts` has `output: "export"` — no server-side code possible
- Auth is client-only: SHA-256 hash in PouchDB settings doc, session in `sessionStorage`

---

## Target State

```
Browser (no local DB)
  └── fetch → Next.js API routes → better-sqlite3 → gleaned.db (SQLite file)
```

- `lib/db/` re-implemented as thin API clients (same public function signatures)
- `app/api/` contains all server-side logic
- `lib/crypto.ts` unchanged — client still encrypts before every API call
- Auth: Argon2id verifier on the server, HttpOnly session cookie (see
  "Auth Model" — this is **not** the same SHA-256-over-the-wire scheme as before)
- CouchDB container removed from Docker Compose
- Service worker: static asset caching + offline shell, no data caching

---

## What Does Not Change

| Concern | Status |
|---|---|
| All UI components | Unchanged shapes; loading/error handling added where currently absent |
| `lib/crypto.ts` (PBKDF2 key derivation, AES-GCM) | Unchanged |
| Export / import JSON | Unchanged |
| E2E encryption model | Unchanged — server sees only ciphertext |
| Docker Compose deployment | Updated, not replaced |
| All existing features | Preserved |

---

## Schema Design

### Encryption boundary

The server stores two kinds of columns:

- **Plaintext index columns** — values the server needs to sort, filter, or
  count. These do not contain journal content or personal text.
- **`data_enc`** — AES-GCM encrypted JSON blob containing all other fields.
  The server stores this opaquely; only the client can decrypt it.

This preserves E2E while enabling server-side queries for the common cases
(entries by date, threads by due date, review queue by `next_review`).

### Schema organisation

Schemas are split by who needs them:

```
lib/db/schema/
  shared/        ← imported by both server and (later) native apps
    entries.ts
    threads.ts
  server/        ← server-only; never imported by native code
    settings.ts
    sessions.ts
```

Native apps will mirror `shared/` and add their own sync-metadata tables
(`sync_state`, `pending_ops`) on top, never modifying the shared schema.

### Tables

```sql
-- ── shared ──────────────────────────────────────────────────────────────────

CREATE TABLE entries (
  id              TEXT PRIMARY KEY,
  date            TEXT NOT NULL,        -- "YYYY-MM-DD", plaintext for calendar queries
  created_at      TEXT NOT NULL,        -- ISO 8601
  updated_at      TEXT NOT NULL,        -- ISO 8601, used for last-write-wins
  next_review     TEXT,                 -- ISO 8601, plaintext for review queue
  review_interval REAL,                 -- days (SM-2), plaintext for scheduling
  data_enc        BLOB NOT NULL         -- AES-GCM(JSON({content, tags, type, source, stake, gap, attachments}))
);
CREATE INDEX entries_date        ON entries(date);
CREATE INDEX entries_next_review ON entries(next_review);

CREATE TABLE threads (
  id          TEXT PRIMARY KEY,
  done        INTEGER NOT NULL DEFAULT 0,  -- 0/1, plaintext for filter
  due_date    TEXT,                         -- "YYYY-MM-DD", plaintext for sorting
  color       TEXT,                         -- plaintext (not sensitive)
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  data_enc    BLOB NOT NULL                 -- AES-GCM(JSON({text}))
);
CREATE INDEX threads_due ON threads(done, due_date);

-- ── server-only ─────────────────────────────────────────────────────────────

CREATE TABLE settings (
  id                     TEXT PRIMARY KEY DEFAULT 'gleaned_settings',
  password_verifier      TEXT,           -- argon2id hash of the user's password (server-side only)
  language               TEXT NOT NULL DEFAULT 'de',
  week_start             TEXT NOT NULL DEFAULT 'monday',
  theme                  TEXT NOT NULL DEFAULT 'system',
  body_font              TEXT NOT NULL DEFAULT 'sans',
  default_view           TEXT NOT NULL DEFAULT 'journal',
  auto_lock_after_minutes INTEGER NOT NULL DEFAULT 15,
  custom_entry_types     TEXT NOT NULL DEFAULT '[]',  -- JSON array
  context_sources        TEXT NOT NULL DEFAULT '[]'   -- JSON array
);

CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,    -- 32-byte random hex
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
CREATE INDEX sessions_expires ON sessions(expires_at);
```

Notes on the schema:

- `data_enc` is `BLOB`, not `TEXT`. AES-GCM ciphertext is binary; storing it
  as text forces base64 (33% size penalty) for no benefit.
- `password_verifier` (not `password_hash`) — the name reflects that it is an
  Argon2id verifier string, not a fast hash. See "Auth Model".
- `auto_lock_after_minutes` makes the unit explicit — the previous
  `auto_lock_after` would have been a footgun.
- `couchdb_url` and friends are removed from settings entirely.

---

## Auth Model

The previous design (SHA-256 of the password client-side, stored as-is)
**cannot be carried over** to a client/server architecture. SHA-256 is fast
enough that an attacker who reads the database file gets practical access via
rainbow tables; worse, the hash itself functions as a bearer credential — if
TLS is broken or the server is compromised, the attacker can replay the hash
and log in. We change this.

### What the password is used for (two independent purposes)

1. **Encryption-key derivation** — `PBKDF2(password, salt)` happens
   **client-side** in `lib/crypto.ts`. The derived key never leaves the
   client. **This stays exactly as it is today.**
2. **Server-side authentication** — proves to the server that this client
   knows the password, so it is allowed to read/write ciphertext.
   **This is what we change.**

The two are separate. The server's verifier is *not* the encryption key;
leaking the verifier does not leak the user's data (which is encrypted with
PBKDF2-derived keys the server never sees).

### Login flow

```
1. User enters password in LockScreen.
2. Client: PBKDF2(password, salt) → encryptionKey       [unchanged, in-memory]
3. Client: POST /api/auth/login { password }            [over TLS]
4. Server: argon2id.verify(stored_verifier, password)
5. Server: INSERT INTO sessions (id, expires_at) → random 32-byte token
6. Server: Set-Cookie: sid=<token>; HttpOnly; Secure; SameSite=Strict; Path=/
7. Client: stores encryptionKey in memory (sessionStorage), as before.
```

The plaintext password crosses the network **once per login**, over TLS, and
is never persisted on the server (only the Argon2id verifier is). On first
setup, the server runs `argon2id.hash(password)` and stores the result in
`settings.password_verifier`.

### Setup flow

`POST /api/auth/setup { password }`:

1. Server checks `settings.password_verifier IS NULL`. If a verifier already
   exists, returns **409 Conflict** (prevents takeover via re-setup).
2. Server runs `argon2id.hash(password)` → stores in `password_verifier`.
3. Same session creation as login.

### Session model

- Session ID: 32 random bytes hex-encoded, generated by `crypto.randomBytes`
- TTL: 24 hours (configurable)
- Cookie: `HttpOnly; Secure; SameSite=Strict; Path=/`
- Cleanup: every login deletes expired sessions
  (`DELETE FROM sessions WHERE expires_at < datetime('now')`).
  Cheap, runs naturally on the busiest endpoint.

The client-side `autoLockAfter` idle timeout still clears the in-memory
encryption key as before; the server session persists longer because it
controls only data access, not the UI lock.

### Why not JWTs

A stateless token would force us to either keep a revocation list (defeating
statelessness) or accept that logout takes effect only on token expiry. With
a server-side sessions table, logout is instant and auditable. SQLite makes
the per-request lookup trivially fast.

### CSRF

`SameSite=Strict` on the cookie blocks cross-site form POSTs and image-tag
GETs. We additionally require `Content-Type: application/json` on all
mutating endpoints, which forces a preflight on cross-origin requests and
blocks `<form>`-based CSRF.

---

## API Contract

All endpoints require a valid `sid` cookie except `/api/auth/*`.

### Auth

| Method | Path | Body | Response |
|---|---|---|---|
| `GET` | `/api/auth/status` | — | `{ setup: bool, authenticated: bool }` |
| `POST` | `/api/auth/setup` | `{ password }` | `{ ok: true }` + Set-Cookie. **409** if verifier exists. |
| `POST` | `/api/auth/login` | `{ password }` | `{ ok: true }` + Set-Cookie |
| `POST` | `/api/auth/logout` | — | clears cookie, deletes session |

### Entries

| Method | Path | Query / Body | Notes |
|---|---|---|---|
| `GET` | `/api/entries` | `?date=YYYY-MM-DD` | entries for one day |
| `GET` | `/api/entries` | `?from=&to=` | range (calendar heatmap) |
| `POST` | `/api/entries` | `{ id, date, created_at, updated_at, next_review?, review_interval?, data_enc }` | create |
| `PUT` | `/api/entries/:id` | same shape | full replace; `If-Match` ETag for LWW |
| `DELETE` | `/api/entries/:id` | — | |
| `GET` | `/api/entries/review` | `?date=YYYY-MM-DD` | next_review ≤ date |

### Threads

| Method | Path | Body | Notes |
|---|---|---|---|
| `GET` | `/api/threads` | — | all threads |
| `POST` | `/api/threads` | `{ id, done, due_date?, color?, created_at, updated_at, data_enc }` | create |
| `PUT` | `/api/threads/:id` | same shape | full replace |
| `DELETE` | `/api/threads/:id` | — | |

### Settings

| Method | Path | Body | Notes |
|---|---|---|---|
| `GET` | `/api/settings` | — | all settings (`password_verifier` never leaves the server) |
| `PUT` | `/api/settings` | partial settings object | merge update |

### Data

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/export` | full JSON export (ciphertext blobs as base64) |
| `POST` | `/api/import` | imports entries + threads from JSON export |

### Wire format for `data_enc`

`data_enc` is sent over the wire as **base64-encoded** strings (JSON cannot
carry binary). The server decodes and stores as `BLOB`. Clients receive
base64 from `GET` and re-encode to base64 for `POST`/`PUT`. Define this once
in `lib/api-client.ts` so it is not re-implemented per endpoint.

---

## Loading & Error States — Honest Note

PouchDB queries today feel synchronous (local IndexedDB, sub-millisecond).
After this migration, every read becomes a real network call with real
latency and real failure modes (network down, 500, 401 expired session).

**This is unavoidable and the plan must budget for it.** Specifically:

- Every place currently doing `await db.find(...)` and rendering the result
  immediately needs to handle: pending state, error state, refetch.
- Lists that today render instantly will need skeleton placeholders or
  optimistic UI.
- The session-expired path must redirect to the LockScreen without losing
  the user's in-progress draft.

The UI components do not need new function signatures, but they will need
new states. This is real work, not a free lunch. Estimate: ~1–2 days of
component-level polish across the app, concentrated in `JournalDay`,
`ReviewQueue`, `ThreadsList`, and `Calendar`.

---

## Phase-by-Phase Plan

### Phase 0 — Preparation (no breaking changes)

Goal: set up tooling without touching any runtime code.

- [ ] Add `better-sqlite3`, `drizzle-orm`, `drizzle-kit`, `argon2` (or
      `@node-rs/argon2`) to `dependencies`
- [ ] Create `lib/db/schema/shared/{entries,threads}.ts` and
      `lib/db/schema/server/{settings,sessions}.ts` (Drizzle table
      definitions, no runtime effect yet)
- [ ] Run `drizzle-kit generate` → creates `lib/db/migrations/0000_initial.sql`
- [ ] Create `lib/db/server.ts` — singleton with WAL mode (not imported yet):

      ```ts
      const db = new Database(process.env.DB_PATH!);
      db.pragma("journal_mode = WAL");
      db.pragma("synchronous = NORMAL");
      db.pragma("foreign_keys = ON");
      db.pragma("busy_timeout = 5000");
      ```

- [ ] Add a `globalThis` singleton guard in `lib/db/server.ts` to survive
      Next.js HMR module reloads without leaking file descriptors
- [ ] Add `DB_PATH` to `.env.example`

**Deliverable:** schema and DB connection code exist and type-check, but
nothing uses them. Zero runtime risk.

---

### Phase 1 — Infrastructure

Goal: Next.js can run API routes; DB initialises on startup.

- [ ] Remove `output: "export"` from `next.config.ts`
- [ ] Add `export const runtime = "nodejs"` to **every** API route file
      (better-sqlite3 is a native binding; the Edge runtime cannot load it).
      A repo-wide ESLint rule enforces this on `app/api/**/route.ts`.
- [ ] Add a `prestart` script that runs migrations before the Next.js
      server boots:

      ```json
      "scripts": {
        "prestart": "drizzle-kit migrate",
        "start": "next start"
      }
      ```

      Migrations on module-load are deliberately avoided — they race under
      Next.js worker recycling and HMR.

- [ ] In dev, run migrations via `pnpm db:migrate` script (developer-driven)
- [ ] Add `gleaned.db`, `gleaned.db-wal`, `gleaned.db-shm` to `.gitignore`
- [ ] Update `docker/compose.traefik.yml`:
  - Add `DB_PATH=/data/gleaned.db` environment variable
  - Add `gleaned_data:/data` named volume mount
  - Add a `command` wrapper or entrypoint that runs migrations before `next start`
  - Set the container user to one with write access to `/data` (document
    this explicitly with a comment in the compose file)
  - Keep the `couchdb` service for now behind a `# TODO: remove after Phase 6` comment
- [ ] Add a backup cron sidecar (or note for the operator):

      ```
      sqlite3 /data/gleaned.db "VACUUM INTO '/backups/gleaned-$(date +%Y%m%d).db'"
      ```

      `VACUUM INTO` is safe under concurrent writes (unlike `cp`).

- [ ] Verify: `pnpm dev` still starts, `pnpm build` succeeds without
      `output: "export"`

---

### Phase 2 — Auth API

Goal: setup/login/logout via API, session cookie works end-to-end.

- [ ] `app/api/auth/status/route.ts` — reads settings row, returns
      `{ setup, authenticated }`
- [ ] `app/api/auth/setup/route.ts` — verifies no existing verifier, hashes
      password with Argon2id, stores, creates session
- [ ] `app/api/auth/login/route.ts` — verifies password against Argon2id
      verifier, creates session, sets cookie, sweeps expired sessions
- [ ] `app/api/auth/logout/route.ts` — deletes session row, clears cookie
- [ ] `app/api/_auth.ts` — `requireAuth(request)` helper used by every
      non-auth route; returns 401 on missing/invalid/expired session
- [ ] Create `lib/api-client.ts` — `fetch` wrapper:
  - Always `credentials: "include"` (cookie sent same-origin)
  - Always `Content-Type: application/json` on writes
  - Centralised 401 handling (redirect to LockScreen)
  - `data_enc` base64↔Uint8Array codec helpers
- [ ] Update `lib/auth.ts`:
  - `setupPassword(password)` → `POST /api/auth/setup { password }`
  - `login(password)` → `POST /api/auth/login { password }`
  - `logout()` → `POST /api/auth/logout`
  - `isAuthenticated()` → `GET /api/auth/status` (memoised for the session)
- [ ] Update `LockScreen.tsx` only where the call shape genuinely changed

**Verification:** login flow works end-to-end. Page refresh preserves the
session. Logout clears the cookie *and* deletes the row.

---

### Phase 3 — Data API

Goal: all CRUD endpoints exist and return correctly shaped data.

- [ ] `app/api/entries/route.ts` — GET (by date/range), POST
- [ ] `app/api/entries/[id]/route.ts` — PUT, DELETE
- [ ] `app/api/entries/review/route.ts` — GET review queue
- [ ] `app/api/threads/route.ts` — GET all, POST
- [ ] `app/api/threads/[id]/route.ts` — PUT, DELETE
- [ ] `app/api/settings/route.ts` — GET (excluding `password_verifier`), PUT
- [ ] `app/api/export/route.ts` — GET full export
- [ ] `app/api/import/route.ts` — POST import

All routes call `requireAuth(request)` first. All routes accept and emit
`data_enc` as base64 strings.

At this stage, these routes exist but `lib/db/` still uses PouchDB. The
API can be tested independently with `curl` or Insomnia.

---

### Phase 4 — Client Rewrite

Goal: replace PouchDB calls in `lib/db/` with API calls. Components keep
their import paths.

The constraint: **public function signatures in `lib/db/index.ts` stay
identical.** What changes inside is the implementation. Components also
gain loading/error state handling where they currently render synchronously
(see "Loading & Error States" above).

File-by-file:

| File | Change |
|---|---|
| `lib/db/entries.ts` | Replace PouchDB queries with `fetch` to `/api/entries` |
| `lib/db/threads.ts` | Replace PouchDB queries with `fetch` to `/api/threads` |
| `lib/db/settings.ts` | Replace PouchDB doc with `fetch` to `/api/settings` |
| `lib/db/sync.ts` | **Delete** — no sync layer |
| `lib/db/conflicts.ts` | **Delete** — no conflict resolution |
| `lib/db/client.ts` | **Delete** — PouchDB singleton gone |
| `lib/db/bootstrap.ts` | **Delete** — CouchDB bootstrap gone |
| `lib/db/migrations.ts` | **Delete** — PouchDB migrations gone |
| `lib/db/index.ts` | Update re-exports; remove sync/conflict exports |

Encryption stays in the same place: `lib/db/entry-crypto.ts` and
`lib/db/thread-crypto.ts` wrap entries/threads with AES-GCM before the
`fetch` call and decrypt the response. The server only ever sees ciphertext.

Component-level loading/error pass: `JournalDay`, `ReviewQueue`,
`ThreadsList`, `Calendar`, `SettingsModal`. Add skeletons or `aria-busy` and
graceful 401 redirect.

---

### Phase 5 — One-Time Data Migration

Goal: existing users' PouchDB data is moved to SQLite on first login after
the update, without data loss.

The shape of `data_enc` in the new schema is **not** byte-compatible with
the per-field encryption today: existing PouchDB documents have multiple
encrypted fields plus PouchDB metadata (`_id`, `_rev`); the new schema has
one `data_enc` blob per row. Migration must therefore decrypt, re-shape,
and re-encrypt — there is no shortcut.

```
1. On login: check if localStorage["gleaned-migrated-v1"] === "done".
2. If not:
   a. Open the existing PouchDB.
   b. Read every entry document. For each:
      - Decrypt fields with the current encryption key.
      - Re-shape into the new entry payload (single object with all
        formerly-separate encrypted fields).
      - Re-encrypt with the same key as a single AES-GCM blob.
      - POST to /api/entries.
   c. Same for threads → POST to /api/threads.
   d. PUT settings (filtered: drop CouchDB-related fields).
   e. After all POSTs return 200/201:
      - Set localStorage["gleaned-migrated-v1"] = "done".
      - DO NOT delete PouchDB yet. Keep it for one release as a safety net.
3. After confirming a release with no migration-failure reports,
   ship a follow-up that calls indexedDB.deleteDatabase("gleaned")
   when "gleaned-migrated-v1" === "done" and the migration is older than
   N days.
```

If any step fails, the migration is aborted, the localStorage flag is *not*
set, PouchDB is *not* touched, and the user gets a "migration failed,
please retry or contact support" dialog with an export-PouchDB-as-JSON
escape hatch.

- [ ] `lib/db/migrate-from-pouchdb.ts` — migration function, idempotent on
      individual records (POST is safe to retry; server uses `INSERT OR
      REPLACE` keyed on `id`)
- [ ] Called in `lib/auth.ts` `login()` after successful session creation
- [ ] Tested on a real PouchDB dump (export a current dev DB, run migration
      offline against a local API instance, diff entry/thread counts and
      decrypted contents)
- [ ] Telemetry-free failure dialog with "download PouchDB dump" button

---

### Phase 6 — Cleanup

Goal: remove everything PouchDB/CouchDB-related, after Phase 5 has been in
production for at least one release with zero migration-failure reports.

- [ ] Remove `pouchdb` and `pouchdb-find` from `package.json`
- [ ] Remove `couchdb` service from Docker Compose files
- [ ] Remove `docker/couchdb/` directory
- [ ] Remove `components/ConflictModal.tsx` and its usage in `AppShell.tsx`
- [ ] Remove `lib/use-conflict-count.ts`
- [ ] Remove `lib/db/sync.ts`, `conflicts.ts`, `client.ts`, `bootstrap.ts`,
      `migrations.ts`
- [ ] Ship the deferred `indexedDB.deleteDatabase("gleaned")` cleanup
      (see Phase 5 step 3)
- [ ] Simplify `public/sw.js`. Target offline behaviour:
  - **Navigation**: network-first; on failure, serve cached app shell from
    `/` so the LockScreen renders with a "you are offline" banner instead of
    a blank Chrome error page
  - **`/_next/static/`**: cache-first (immutable, hashed)
  - **`/api/*`**: network-only, never cache
  - **Other**: stale-while-revalidate
  - Drop the `selfHeal()` chunk-recovery logic (no longer needed without
    `output: "export"`)
- [ ] Remove `NEXT_PUBLIC_COUCHDB_URL` and any `couchdb*` env vars from
      `.env.example` and all references
- [ ] Update `CLAUDE.md` and `README` to reflect the new architecture

---

### Phase 7 — Tests

Goal: test suite reflects the new architecture.

- [ ] Rewrite `lib/db/*.test.ts` — mock `fetch` instead of PouchDB
- [ ] `lib/db/entry-crypto.test.ts` and `thread-crypto.test.ts` — verify
      they still pass unchanged (encryption logic is not affected)
- [ ] Update E2E tests (`e2e/auth.spec.ts`, `e2e/journal.spec.ts`) to drive
      against the real API. The component shape is unchanged so most
      assertions hold.
- [ ] Add API integration tests (`e2e/api.spec.ts`): setup → login →
      create entry → read back → verify ciphertext column is opaque to the
      server (`data_enc` is not valid UTF-8 / does not contain known plaintext)
- [ ] Add a migration test (`e2e/migration.spec.ts`): seed a PouchDB with
      known content, run migration, assert all entries are reachable
      through the new API and decrypt to identical plaintext

---

## Risk and Rollback

**Risk: migration loses existing data.**
Mitigation: Phase 5 keeps PouchDB intact until the migration is verified in
production over at least one release. The `data_enc` re-shape is the
highest-risk step and is covered by `e2e/migration.spec.ts` against a real
PouchDB dump.

**Risk: Argon2id is too slow on small servers.**
Mitigation: Argon2id parameters are tuned for ~250 ms per verify on the
target hardware (RPi-class up). Login is human-paced, this is invisible.
Setup and login already involve user-perceivable work; nobody notices.

**Risk: session cookie not sent in certain environments.**
Mitigation: `SameSite=Strict; Secure; HttpOnly; Path=/`. In development over
HTTP, `Secure` is dropped automatically by Next.js's cookie helper. Document
that production *must* run behind HTTPS (it already does, via Traefik).

**Risk: SQLite file permissions in Docker.**
Mitigation: `DB_PATH=/data/gleaned.db` with a named volume. Container user
must own `/data`. Documented explicitly in the Compose file.

**Risk: SQLite corruption from `cp` backup during writes.**
Mitigation: backup uses `VACUUM INTO`, which is concurrent-safe.

**Risk: CSRF.**
Mitigation: `SameSite=Strict` cookie + `Content-Type: application/json`
required on writes. Documented in "Auth Model".

**Rollback:**
- Before Phase 4 deploys: trivial. CouchDB still in Compose, PouchDB still
  in client.
- After Phase 4 but before Phase 6: rollback requires reverting the
  client and restoring the SQLite file from the latest `VACUUM INTO`
  backup. PouchDB is still on every user's device until Phase 6 ships,
  which acts as a per-user backup.
- After Phase 6: rollback requires SQLite backup restore only.

This is why Phase 5 must be in production for at least one release before
Phase 6 ships.
