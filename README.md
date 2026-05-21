# gleaned

> *to collect gradually and bit by bit; to gather the knowledge left behind by each day.*

A personal, offline-first learning journal. Encrypted. Self-hosted. No accounts.

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

---

## Features

- **Journal** — write entries in Markdown, attach images, audio, video, code files, and PDFs
- **Spaced repetition** — every entry enters a review queue; intervals grow automatically so you revisit things right before you forget them
- **Search** — instant full-text search across all entries (⌘K / Ctrl+K)
- **Calendar** — browse any day's entries in a heatmap view
- **Learning list** — todos with due dates, color labels, and overdue indicators
- **End-to-end encryption** — PBKDF2 + AES-GCM; the key never leaves your device
- **CouchDB sync** — optional self-hosted sync across browsers and devices
- **PWA** — installable, works fully offline
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
  <img src="docs/screenshot-todo.png" width="49%" alt="Learning list" />
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

On first launch you'll be asked to set a password. This password encrypts all your entries — it cannot be recovered if lost.

---

## CouchDB sync (optional)

Sync lets you share your journal across browsers and devices. Each browser has its own local IndexedDB; CouchDB merges them including the password hash, so you only need to register once.

**Development** — run only CouchDB locally, Next.js on the host:

```bash
docker compose -f docker-compose.dev.yml up -d
pnpm dev
```

**Production** — app + CouchDB together:

```bash
cp .env.example .env
# edit .env with your credentials
docker compose up -d
# → http://localhost:3000
# → http://localhost:5984/_utils  (CouchDB admin)
```

Then open Settings → Sync and enter your CouchDB URL.
In production the app proxies CouchDB through nginx — no extra port needed:

```
http://localhost:3000/db/gleaned
```

Enter username and password in the separate fields. For local development with `docker-compose.dev.yml`, CouchDB is accessible directly on port 5984:

```
http://localhost:5984/gleaned
```

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (static export, Turbopack) |
| UI | React 19, Tailwind CSS v4 |
| Local database | PouchDB (IndexedDB) |
| Sync | CouchDB (Docker, optional) |
| Encryption | PBKDF2 + AES-GCM |
| Fonts | DM Sans, Lora, Playfair Display, Caveat |
| Package manager | pnpm |
