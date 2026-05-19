# Gleaned - Self-Investment Journal

## Development

```bash
pnpm install
pnpm dev
```

## Docker Setup (with CouchDB Sync)

1. Copy `.env.example` to `.env` and set your credentials.
2. Start the services:
   ```bash
   docker-compose up -d
   ```

The app will be available at `http://localhost:3000`. CouchDB will be at `http://localhost:5984/_utils/`.

## Architecture

- **Frontend:** Next.js (App Router), Tailwind CSS, OKLCH colors.
- **Database:** PouchDB (Client-side / IndexedDB) with CouchDB synchronization.
- **Offline-First:** Your data is saved locally and synced automatically when a connection is available.
