# Architecture Decision: Storage Layer

**Date:** 2026-05-27
**Status:** Decided

---

## TL;DR

Local-first does not belong in the browser. We were forcing three goals into
one client — local-first storage, end-to-end encryption, and a browser runtime
— and two of them fight the third. The fix is to drop local-first **in the web
client only** and move it to the native apps where it actually fits. E2E
encryption stays everywhere.

---

## What We Tried, and Why It Hurts

The original design ran three things together in the browser:

1. **Local-first data** — PouchDB on top of IndexedDB
2. **End-to-end encryption** — AES-GCM on the client before any byte leaves
3. **Cloud sync** — PouchDB replicating to a self-hosted CouchDB

On paper this is the local-first manifesto in code form. In practice, every
recurring bug class in this repo traces back to one root cause: **the browser
was never designed to host persistent application data**. It is a document
viewer with storage bolted on as an optimisation, not a database host.

Concrete pain we paid for forcing local-first into a browser:

- **Service-Worker caching** — careful strategy needed so a deploy does not
  leave a stale HTML referencing dead chunk URLs. Multiple bugs, multiple
  fixes, ongoing maintenance burden.
- **CouchDB CORS** — browser sends `Origin` on same-origin POST/PUT (e.g.
  `_bulk_get`, `_local` checkpoints). CouchDB's CORS allowlist had to be
  managed alongside every domain change.
- **PouchDB 9 auth** — the legacy `ajax` adapter was removed; the HTTP
  adapter only reads `fetch`/`headers` from the *remote DB constructor*.
  Required a `fetch` override to inject `Authorization` on every request.
- **Conflict resolution** — live bidirectional sync produces CouchDB document
  conflicts. We had to build a full UI flow (`ConflictModal`) to resolve them.
- **Browser storage eviction** — IndexedDB can be cleared under storage
  pressure. `navigator.storage.persist()` mitigates this on installed PWAs but
  is not a guarantee, especially on iOS Safari.

These bugs are individually fixable (and most are fixed). The problem is that
they are not random — they are the bow-wave of an architectural mismatch.
Every fix unblocks the next category of bug from the same root.

---

## The Real Distinction: Self-Hosted ≠ Local-First

A subtle but important point, because it shaped the wrong version of this
decision:

- **Self-hosted** = you control the server. ("Whose infrastructure is it?")
- **Local-first** = the device has a complete, independent copy of the data
  and works without the server. ("Where is the source of truth?")

These are orthogonal. Self-hosting gleaned does not make it local-first. The
test is simple: stop the server. If the client still works, it is local-first.
If the client goes dark, it is a server-client — regardless of who owns the
server.

Co-locating the server (Docker on the same laptop as the browser) feels
local-first because the local network never goes down. It is not. The moment
the user picks up their phone, opens a second device, or the container
restarts during an update, the illusion ends.

This is why the browser app cannot honestly call itself local-first just
because gleaned is self-hosted. They are different properties.

---

## The Core Insight

Local-first solves four real problems:

1. Offline functionality
2. Zero-latency interaction
3. Survival of server outages
4. Data sovereignty against a third-party operator

For a **self-hosted** product, problem 4 disappears — you are the operator.
Problems 1–3 remain real, but they only matter on devices that actually go
offline or care about latency: **mobile phones**.

A laptop browser on a desk in front of a self-hosted server has none of these
problems acutely. It is online, it is on a fast LAN, and the server is up.
Pretending it needs local-first storage produces all the costs above and buys
nothing the user can feel.

The right place for local-first is the **native mobile app**, where:

- SQLite is a real persistent database, not a best-effort browser cache
- Storage eviction does not happen
- Background sync to a server API is a well-understood OS-level pattern
- Offline-first is a first-class platform feature, not a workaround

---

## New Direction

### What stays everywhere

| Concern | How it is handled |
|---|---|
| End-to-end encryption | Client encrypts with AES-GCM before sending. Server stores ciphertext only. **Unchanged.** |
| Self-hosting | Docker Compose deployment is unchanged. |
| Data portability | Export / import JSON remains the user-facing backup. |

### What changes in the **web** client

| Before | After |
|---|---|
| PouchDB + IndexedDB | No client-side database |
| CouchDB sync | Server-side database (PostgreSQL or SQLite) accessed via API |
| PouchDB HTTP adapter auth | Standard `Authorization` header in API client |
| CouchDB conflict resolution | Last-write-wins with `If-Match` ETags at the API layer |
| `output: "export"` static build | Next.js with API routes |
| SW caching HTML + data | SW caches only static assets |
| "Offline = keep working" | "Offline = UI loads, shows graceful offline state" |

The web client becomes an honest server-client: a fast, encrypted window onto
your server. It does not pretend to work offline, because it does not.

### What the **native apps** keep / get

| Concern | How it is handled |
|---|---|
| Local storage | SQLite (real persistent DB, no eviction) |
| Sync | Background sync to the same server API the web client uses |
| Offline writes | First-class, with a sync queue |
| E2E encryption | Same `lib/crypto.ts` model as web |

Both clients share the same server API and the same encryption boundary. Only
the persistence strategy differs — and it differs for a reason that matches
each platform's actual capabilities.

### What is removed from the web client

- `pouchdb`, `pouchdb-find`
- The CouchDB container
- `ConflictModal` and conflict-resolution flow
- Service-worker data caching logic
- `output: "export"` in `next.config.ts`
- The pre-flight `isCouchDB()` validation, `_validatedKey` cache, and the
  remote-DB `fetch` override in `lib/db/sync.ts`

---

## Trade-Offs We Are Accepting (Honestly)

This decision is not free. The web app loses real things:

- **No offline writes in the browser.** A user on a flaky train Wi-Fi cannot
  jot a thought into the web client. They can in the native app.
- **Server outages are user-visible.** A 30-second container restart during a
  deploy means a 30-second period where the web client cannot read or write.
- **Server-side search is on ciphertext only.** With E2E preserved, the server
  cannot index entry contents. Full-text search must happen client-side after
  decrypting the page of results. This is the same constraint as before, but
  it now matters more because the client no longer has a local index.
- **Operational complexity moves to the server.** Backups of PostgreSQL or
  SQLite become the user's responsibility instead of being implicit in
  CouchDB's data files.

We accept these because the alternative — keeping local-first in the browser
— means continuing to pay the bug-bow-wave cost forever, and because users
who genuinely need offline have the native apps for that.

---

## Architecture Summary

```
Browser    →  HTTP/JSON API  →  Server DB (Postgres/SQLite)
                    ↑
iOS App    ←→  sync (HTTPS)  ←→  Server API
                    ↑
Android    ←→  sync (HTTPS)  ←→  Server API
```

Single source of truth: the server DB. Single API surface for all clients.
E2E encryption is a property of the data shape, not of any one client.

---

## Migration Path (Web App)

1. Remove `output: "export"` from `next.config.ts`
2. Add Next.js API routes under `app/api/`
3. Add a server-side database (SQLite via `better-sqlite3` for simplicity, or
   PostgreSQL for multi-instance setups)
4. Replace the PouchDB calls in `lib/db/` with `fetch` calls to the API; keep
   the public function signatures so `components/` does not need to change
5. Keep all encryption logic in `lib/crypto.ts` — unchanged
6. Remove the CouchDB service from `docker/compose.traefik.yml`
7. Simplify the service worker to asset-only caching; drop `/db/` exclusions
8. Remove `ConflictModal` and its imports
9. Provide a one-time client-side migration: read existing PouchDB entries,
   POST them to the new API, then drop the IndexedDB

The UI layer (`components/`) is almost entirely unaffected. The blast radius
is `lib/db/`, `app/api/` (new), the SW, and the Compose file.
