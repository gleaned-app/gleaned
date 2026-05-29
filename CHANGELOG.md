# Changelog

All notable changes to gleaned are documented here.

## [0.4.1] — 2026-05-29

### Security

- **Setup token** — gleaned now generates a random 16-byte token on first boot and prints it to stdout. The setup form requires this token to complete initial registration, preventing an attacker who finds a freshly deployed instance from setting the password before the owner does.
- **Rate limiting on setup endpoint** — `/api/auth/setup` now enforces the same 5-attempts / 15-minute window as `/api/auth/login`. Failed token attempts count against the limit.
- **Fixed silent plaintext fallback** — `encryptEntryToApi` and `encryptThreadToApi` previously fell back to base64-encoding the plaintext payload when the encryption key was not loaded, storing unencrypted data without any warning. Both functions now throw immediately if the key is absent — entries and threads can only be written when the user is authenticated and the key is in memory.
- **Timezone validation** — the `tz` field in `/api/push/subscribe` is now validated against `Intl.supportedValuesOf("timeZone")` before being stored. Invalid values fall back to UTC. The `PUSH_TZ` environment variable is validated at startup with a console warning on invalid input.

---

## [0.4.0] — 2026-05-29

This release replaces the entire storage layer and consolidates the deployment from three containers down to one. The architectural reasoning is documented in [docs/architecture-decision-storage.md](docs/architecture-decision-storage.md).

### Changed
- **Storage: PouchDB/CouchDB → SQLite** — all data now lives in a single `gleaned.db` file on the server, accessed via Next.js API routes. No client-side database, no sync protocol, no conflict resolution. The E2E encryption boundary is unchanged — the server still only ever stores ciphertext.
- **Auth: PBKDF2-SHA-1 → Argon2id** — stronger password hashing with automatic silent upgrade on next login.
- **Push notifications integrated into main app** — the separate `pusher` container is gone. Scheduling now runs inside the gleaned server process via `instrumentation.ts` and `node-cron`. Daily reminders and due-date reminders read from SQLite directly.
- **Push subscriptions stored in SQLite** — subscriptions are part of `gleaned.db` and backed up automatically alongside all other data.
- **Push endpoints moved to `/api/push/`** — subscribe, vapid-key, and manual broadcast are now standard Next.js API routes with session-cookie auth.
- **Docker: three containers → one** — `app + nginx + couchdb + pusher` replaced by a single `app` service.

### Added
- Drizzle ORM with committed migration files (`lib/db/migrations/`)
- `docker/setup.sh` — generates SEND_SECRET and VAPID keys before first launch
- GitHub Releases created automatically from CHANGELOG on version tags

### Removed
- PouchDB, CouchDB, and all sync infrastructure
- `pusher/` service and Docker image (`ghcr.io/gleaned-app/gleaned-pusher`)
- `docker/nginx.conf` and `docker/nginx-entrypoint.sh`
- Conflict resolution UI (`ConflictModal`)

---

## [0.3.0] — 2026-05-23

### Added
- **FSRS-5 spaced repetition**: Review intervals are now calculated using the full FSRS-5 algorithm (Ye et al., SIGKDD 2024) — stability and difficulty are tracked per entry, and intervals grow precisely based on how well you actually remember things
- **Learning context (Lernort)**: Tag entries with where you learned something (Arbeit, Schule, Unterwegs, Zuhause). Quick-fill chips appear in the entry form and edit mode. Contexts are configurable in Settings and shown inline next to the timestamp
- **Custom entry types**: Define your own entry types beyond the built-in ones (Insight, Observation, etc.) in Settings
- **Gap field**: Document what you still don't understand about something — the gap-aware queue prioritises entries with open gaps
- **Review undo**: Undo the last review outcome if you mis-tapped
- **Default view setting**: Choose which view opens on launch (Journal / Calendar / Todos / Review)
- **CI/CD pipeline**: Lint, typecheck, unit tests, E2E tests, and Docker image builds run automatically on every push

### Changed
- **Security — PBKDF2**: Upgraded from SHA-1 to SHA-256, iterations raised to 600 000, salt widened to 256-bit. Existing accounts migrate silently on next login
- **Security — Markdown links**: Links now open with `rel="noopener noreferrer"` to prevent tab-napping
- **Security — Todo encryption**: Todos are now encrypted end-to-end like entries
- **Security — CSP**: Stricter Content-Security-Policy headers, hardened auth guard, validated import format
- **Attachments**: Migrated from base64-in-JSON to native attachments — faster sync, less memory (note: attachment storage was later redesigned in v0.4.0 alongside the SQLite migration)
- **DB architecture**: `db.ts` (1200+ lines) split into 12 focused modules for maintainability
- **Review queue**: Interleaved queue with type-specific prompts, calibration score, and attachment display in review cards

### Fixed
- Local date used consistently in todos and the review scheduler (was UTC, causing off-by-one on timezones west of UTC)
- Lockout timer persists across page reloads
- Service worker cache strategy corrected for hashed Next.js chunks
- Notch / Dynamic Island safe area on iOS

---

## [0.2.0] — 2026-05-21

### Added
- **Spaced repetition**: Every entry enters a review queue with SM-2-style scheduling; three outcomes (still holds / needs revision / superseded)
- **Review history & calibration**: Track every review outcome; a calibration score shows how reliably you retain what you write
- **Push notifications**: Optional reminders for due reviews via Web Push (requires self-hosted pusher service)
- **Traefik support**: Production compose with automatic TLS via Traefik (configurable via `DOMAIN`, `TRAEFIK_NETWORK`, `CERT_RESOLVER`)
- **Sync status indicator**: Live dot in the header — green when syncing, red on error
- **Export / Import**: Full JSON export and import of all entries and todos
- **Source, stake, gap fields**: Collapsible context panel on each entry for bibliographic source, personal stake, and open questions
- **Entry types**: Classify entries as Insight, Technique, Framework, Fact, or Observation
- **Tag management**: Delete tags from Settings; tag autocomplete in the entry form
- **Streak badge**: Consecutive-day streak with glow animation at 30+ days

### Changed
- Authentication state uses a three-state machine (pending / authenticated / locked) instead of a binary flag
- CouchDB now proxied through nginx at `/db/` — no extra port needed in production
- Markdown rendering with DOMPurify sanitization

### Fixed
- Theme flash on page load (inline script reads localStorage before React hydrates)
- Scrolling in Chrome PWA standalone mode

---

## [0.1.0] — 2026-05-19

Initial release.

### Added
- **Journal**: Write entries in Markdown with inline editing and tag support
- **Calendar**: Heatmap calendar — browse any day's entries
- **Todos**: Learning list with due dates, color labels, and overdue indicators
- **Search**: Full-text search across all entries (⌘K / Ctrl+K)
- **Attachments**: Images, audio, video, PDFs, and code files with syntax highlighting
- **End-to-end encryption**: PBKDF2 + AES-GCM; the key never leaves the device
- **CouchDB sync**: Optional self-hosted sync across browsers and devices (replaced by server-side SQLite in v0.4.0)
- **Themes**: Auto / Light / Dark / Sepia, all in OKLCH
- **Fonts**: DM Sans, Lora, Playfair Display, Caveat
- **i18n**: German and English, switchable at runtime
- **PWA**: Installable, works fully offline
- **Docker**: Production and development compose files included
