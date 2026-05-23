# Changelog

All notable changes to gleaned are documented here.

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
- **Attachments**: Migrated from base64-in-JSON to PouchDB native attachments — faster sync, less memory
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
- **CouchDB sync**: Optional self-hosted sync across browsers and devices
- **Themes**: Auto / Light / Dark / Sepia, all in OKLCH
- **Fonts**: DM Sans, Lora, Playfair Display, Caveat
- **i18n**: German and English, switchable at runtime
- **PWA**: Installable, works fully offline
- **Docker**: Production and development compose files included
