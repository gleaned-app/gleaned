# gleaned

> *to collect gradually and bit by bit; to gather the knowledge left behind by each day.*

---

## Why

You know those end-of-day countdown apps — the ones that tell you how many minutes until you can leave work or school. They exist to help you wait. That's the wrong direction.

gleaned starts from the opposite idea: what if, instead of watching the clock, you tracked what you actually picked up today? Not a productivity system. Not a task manager. Just a quiet place to note what stuck — a Wikipedia rabbit hole, a line of code that finally clicked, something a colleague said that made you think, an idea that arrived on the commute home.

The belief behind it is simple: every day you learn something. Most of it evaporates because nothing caught it. gleaned is the net.

It works for small things too — a single sentence, a word you looked up, a thought you don't want to lose. The bar is intentionally low. The point is the habit of noticing, not the size of the insight.

---

A personal, offline-first learning journal. Everything you write is encrypted and stored locally — your data never leaves your device unless you choose to sync it.

---

## Features

- **Daily journal** — write entries in Markdown, attach images, audio, video, code files, and PDFs
- **Full-text search** — instant search across all entries with highlighted matches (⌘K / Ctrl+K)
- **Calendar heatmap** — GitHub-style activity view, browse any day's entries
- **Learning list** — todo list with due dates, overdue indicators and progress tracking
- **End-to-end encryption** — all entries encrypted with PBKDF2 + AES-GCM before hitting IndexedDB
- **CouchDB sync** — optional self-hosted sync shares entries and password hash across browsers and devices
- **PWA** — installable, works fully offline, service worker caches everything
- **Themes** — Auto / Light / Dark / Sepia, all in OKLCH
- **Fonts** — Modern (DM Sans) / Classic (Lora) / Elegant (Playfair Display) / Handwriting (Caveat)
- **i18n** — German and English, switchable at runtime

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

Then open Settings → Sync and enter your CouchDB URL:

```
http://admin:password@localhost:5984/gleaned
```

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (static export, Turbopack) |
| UI | React 19, Tailwind CSS v4 |
| Local database | PouchDB (IndexedDB) |
| Sync | CouchDB (Docker, optional) |
| Encryption | PBKDF2 key derivation + AES-GCM |
| Fonts | DM Sans, Lora, Playfair Display, Caveat (Google Fonts) |
| Package manager | pnpm |

---

## Data model

All documents live in a single PouchDB database (`gleaned`). A `type` field discriminates between them.

```ts
// Journal entry
{ _id: "entry_<ts>_<rand>", type: "entry", content, tags, date, createdAt, attachments? }

// Learning todo
{ _id: "todo_<ts>_<rand>", type: "todo", text, done, createdAt, dueDate? }

// Settings + auth (singleton)
{ _id: "gleaned_settings", type: "settings", passwordHash?, theme?, language?, bodyFont?, weekStart? }
```

Entries are encrypted at write time and decrypted at read time using a key derived from the user's password. The raw content never reaches PouchDB unencrypted.

---

## Project structure

```
gleaned/
├── app/
│   ├── globals.css        # OKLCH palette, themes, animations
│   ├── layout.tsx         # Fonts, PWA meta, SW registration, flash-prevention script
│   └── page.tsx           # Entry point → <AppShell>
├── components/
│   ├── AppShell.tsx        # Auth gate, layout, keyboard shortcuts
│   ├── LockScreen.tsx      # Animated login / register screen
│   ├── JournalView.tsx     # Today's entries + entry form
│   ├── EntryForm.tsx       # Markdown textarea, tag input, file upload
│   ├── EntryCard.tsx       # Entry display, inline edit, delete
│   ├── SearchModal.tsx     # Full-text search overlay (⌘K)
│   ├── CalendarView.tsx    # Heatmap calendar
│   ├── TodoView.tsx        # Learning list with due dates
│   ├── SettingsModal.tsx   # Theme, font, language, sync, data, notifications
│   └── ConflictModal.tsx   # CouchDB conflict resolution UI
├── lib/
│   ├── db.ts              # PouchDB singleton, all CRUD + CouchDB sync
│   ├── auth.ts            # PBKDF2 password setup, session management
│   ├── crypto.ts          # AES-GCM encrypt/decrypt helpers
│   ├── i18n.ts            # DE/EN translation dictionaries + useT() hook
│   └── settings-context.tsx # React context: theme, font, language, sync
└── public/
    ├── manifest.json      # PWA manifest
    └── sw.js              # Service worker (offline-first, stale-while-revalidate)
```
