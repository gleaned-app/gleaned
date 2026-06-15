# gleaned

[![CI](https://github.com/gleaned-app/gleaned/actions/workflows/ci.yml/badge.svg)](https://github.com/gleaned-app/gleaned/actions/workflows/ci.yml)

> *to collect gradually and bit by bit; to gather the knowledge left behind by each day.*

A personal learning journal. End-to-end encrypted. Self-hosted. No accounts.

---

<p align="center">
  <img src="docs/mockup-login.png" width="49%" alt="gleaned login" />
  <img src="docs/mockup-journal.png" width="49%" alt="gleaned journal" />
</p>

---

## Why

You know those end-of-day countdown apps — the ones that tell you how many minutes until you can leave work or school. They exist to help you wait. That's the wrong direction.

gleaned starts from the opposite idea: what if, instead of watching the clock, you tracked what you actually picked up today? Not a productivity system. Not a task manager. Just a quiet place to note what stuck — a Wikipedia rabbit hole, a line of code that finally clicked, something a colleague said that made you think, an idea that arrived on the commute home.

The belief behind it is simple: every day you learn something. Most of it evaporates because nothing caught it. gleaned is the net.

It works for small things too — a single sentence, a word you looked up, a thought you don't want to lose. The bar is intentionally low. The point is the habit of noticing, not the size of the insight.

I'm 18. This is the first project I've shipped. [Read the full story →](docs/story.md)

---

## Features

- **Journal** — write entries in Markdown, attach images, audio, video, code files, and PDFs
- **Spaced repetition** — every entry enters a review queue; intervals grow automatically so you revisit things right before you forget them
- **Search** — instant full-text search across all entries (⌘K / Ctrl+K)
- **Calendar** — browse any day's entries in a heatmap view
- **Learning list** — todos with due dates, color labels, and overdue indicators
- **End-to-end encryption** — PBKDF2 + AES-GCM; the encryption key never leaves your device
- **PWA** — installable on mobile and desktop
- **Themes** — Auto / Light / Dark / Sepia, all in OKLCH
- **Fonts** — Modern (DM Sans) / Classic (Lora) / Elegant (Playfair Display) / Handwriting (Caveat)
- **i18n** — German and English, switchable at runtime

<details>
<summary>All views</summary>
<br>

<p align="center">
  <img src="docs/screenshot-journal.png" width="49%" alt="Journal" />
  <img src="docs/screenshot-calendar.png" width="49%" alt="Calendar" />
</p>
<p align="center">
  <img src="docs/screenshot-review.png" width="49%" alt="Spaced repetition" />
  <img src="docs/screenshot-todo.png" width="49%" alt="Threads" />
</p>
<p align="center">
  <img src="docs/screenshot-settings.png" width="60%" alt="Settings" />
</p>

</details>

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| ⌘K / Ctrl+K | Open search |
| ⌘L / Ctrl+L | Lock the app |
| ⌘↵ / Ctrl+↵ | Save entry |
| Esc | Close any modal |

---

## Getting started

```bash
pnpm install
pnpm dev
# → http://localhost:3000
```

On first launch you'll be asked to set a password. This password derives your encryption key — it cannot be recovered if lost.

gleaned is single-user by design. Each instance supports exactly one registration. If you want a second journal, run a second instance.

---

## Self-hosting

gleaned runs as a single Docker container. All data is stored in a SQLite file on the server, mounted via a named volume so it survives container restarts.

**Port-based (HTTP):**

```bash
sh docker/setup.sh       # generates docker/.env with random secrets
docker compose -f docker/compose.yml up -d
# → http://localhost:3000
```

**Traefik + TLS (recommended for production):**

```bash
sh docker/setup.sh
# edit docker/.env — set DOMAIN
docker compose -f docker/compose.traefik.yml pull
docker compose -f docker/compose.traefik.yml up -d
# → https://your-domain.com
```

Both stacks run as a single container. Push notifications (daily reminders, due-date alerts) are built in — configure VAPID keys via `setup.sh` and set `PUSH_TZ` in `docker/.env`.

> **First-run setup token:** On first boot gleaned prints a one-time setup token to the server logs (`docker compose logs app`). You must enter this token in the setup form to complete the initial registration. The token is invalidated after use and regenerated on the next boot if setup was not completed. Only someone with access to the server logs can set up the instance.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (Turbopack) |
| UI | React 19, Tailwind CSS v4 |
| Database | SQLite via better-sqlite3, server-side |
| API | Next.js API routes |
| Auth | Argon2id (server) + PBKDF2-HMAC-SHA-256 (client key derivation) |
| Encryption | AES-GCM-256, client-side |
| Fonts | DM Sans, Lora, Playfair Display, Caveat |
| Package manager | pnpm |

---

## Security model

### Architecture

gleaned is a self-hosted server application. Your data lives in a SQLite database on your server. The browser encrypts all content with AES-GCM before sending it — the server only ever stores ciphertext and never sees plaintext.

### What is encrypted

Everything you write is encrypted in the browser before it is sent to the server. The encryption key is derived from your password using PBKDF2-HMAC-SHA-256 (600 000 iterations, 128-bit random salt). The key never leaves the browser and is never written to any storage — it lives only in JS memory for the duration of the session.

Encrypted fields per entry: content, tags, source, stake, gap, attachment binaries, attachment metadata.
Encrypted fields per thread: text.

### What is not encrypted — metadata tradeoff

The following fields are stored in plaintext in SQLite to allow scheduling and filtering on the server:

| Table | Field | Why unencrypted |
|---|---|---|
| entries | `date`, `created_at` | Required for calendar view and entry ordering |
| entries | `next_review`, `review_interval` | Scheduling without full table scan |
| threads | `done`, `due_date`, `color` | Sorting and filtering without decrypting every row |
| audit_log | `ts`, `action`, `detail` | Security audit trail (see below) |

**Implication:** someone with access to the server database (the SQLite file) can see *when* you made entries, when they are due for review, and — for todos — whether they are completed, when they are due, and which colour label was assigned. The actual content of entries and todos remains encrypted.

### Audit log

Security-relevant events are written to the `audit_log` table in SQLite. This provides a persistent, tamper-evident record that survives container restarts (stored in the same named volume as the main database).

Logged events:

| Action | When | Captured fields |
|---|---|---|
| `webauthn.credential.registered` | A new Touch ID / Face ID device is enrolled | `credential_id`, `device_name`, `aaguid`, `session_id` |
| `webauthn.credential.revoked` | A credential is deleted from the Security settings | `credential_id`, `device_name`, `registered_at`, `session_id` |

You can query the log directly:

```bash
sqlite3 /path/to/gleaned.db "SELECT ts, action, detail FROM audit_log ORDER BY id DESC LIMIT 20;"
```

### Threat model

- **Remote / network attackers** — the server exposes only the Next.js app. All data returned by the API is ciphertext; an attacker who intercepts traffic or reads the database cannot read your entries.
- **Server compromise** — an attacker with full server access sees only ciphertext. The encryption key is never transmitted.
- **Same-origin JS (extensions, XSS)** — the AES key is in the JS heap and is accessible to any same-origin script during the session. Lock the app (⌘L) when stepping away.
- **Physical access to an unlocked device** — not protected; the key is live in memory. Lock before stepping away.
- **Physical access to a locked device** — protected; the key is wiped from memory on lock, and a wrong password cannot decrypt the data.
- **Brute force** — server-side Argon2id makes each verification attempt slow. The UI adds exponential backoff (1 s, 2 s, 4 s … 30 s cap) persisted across page reloads.

### Accepted dependency advisories

`pnpm audit` advisories that are intentionally ignored (see `pnpm-workspace.yaml`) because the vulnerable code path is never reached in this project:

| Advisory | Package | Why it doesn't apply |
|---|---|---|
| [GHSA-gv7w-rqvm-qjhr](https://github.com/advisories/GHSA-gv7w-rqvm-qjhr) | esbuild (high) | RCE in esbuild's Deno module via `NPM_CONFIG_REGISTRY` — this project is Node.js only, the Deno entry point is never imported. Fix requires esbuild ≥0.28.1, outside the range drizzle-kit accepts. |
| [GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr) | esbuild (low) | Path traversal in esbuild's dev server via `--servedir`, Windows only. Production runs `next start` on Alpine Linux; the dev server is never run on Windows. |
| [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) | vite (high) | `server.fs.deny` bypass via Windows alternate paths in vite's dev server, Windows only. Production never runs the vite dev server, and it's never run on Windows in this project. |
