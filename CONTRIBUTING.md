# Contributing to gleaned

Thanks for your interest in contributing. gleaned is a personal project — contributions are welcome, but please read this first.

## Before you open a PR

- For bug fixes: open an issue first so we can confirm it's actually a bug.
- For new features: open an issue and wait for feedback before writing code. Not every feature fits the scope of the project.
- For typos or small documentation fixes: feel free to open a PR directly.

## Setup

```bash
git clone https://github.com/gleaned-app/gleaned.git
cd gleaned
pnpm install
pnpm dev
# → http://localhost:3000
```

On first launch you'll be asked to set a password. The app stores all data in a local SQLite file (`gleaned.db`) — no external database needed for development.

## Code style

- **TypeScript** everywhere — no `any` unless unavoidable.
- **Tailwind CSS v4** for styles, OKLCH variables for colors — no hardcoded hex/rgb values.
- **i18n**: all user-facing strings go through `useT()` — no hardcoded German or English text in components.
- **No new dependencies** without discussion — keep the bundle lean.

## Commits

- Write commit messages in **English**.
- Keep them short and descriptive: `fix calendar grid overflow on small screens`, not `fix bug`.
- One logical change per commit.

## Pull requests

- Target the `main` branch.
- Describe what changed and why — not just what the code does.
- If your PR changes the UI, include a screenshot.

## Tests

```bash
pnpm test          # unit tests (Vitest)
pnpm test:coverage # coverage report
pnpm test:e2e      # Playwright E2E (requires dev server running)
```

## What's out of scope

- Cloud sync or external database backends (no Firebase, Supabase, CouchDB, etc.)
- Account systems or server-side user management
- Mobile-native builds (covered by the native app roadmap)
- AI writing features inside the app (writing assistance, content suggestions, summaries)
