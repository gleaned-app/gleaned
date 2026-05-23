# gleaned-pusher

Optional push notification service for gleaned. It runs as a separate container alongside the main app and CouchDB, and sends two types of Web Push notifications:

- **Daily learning reminder** — fires once a day (default 20:00) if no entry has been written yet that day
- **Due-date reminder** — fires once a day (default 09:00) listing todos that are due today or overdue

Both reminders are opt-in per browser via Settings → Notifications. The pusher is not required for the core app to work.

---

## How it fits together

```
Browser
  │  (1) subscribe → POST /push/subscribe
  │  (2) receive Web Push ← pusher
  ▼
nginx (port 80/443)
  │  /push/* → proxy → pusher:3001
  │  /db/*   → proxy → couchdb:5984
  ▼
┌─────────────┐     ┌─────────────┐
│   gleaned   │     │   pusher    │──── cron → broadcast
│  (Next.js)  │     │  (Node.js)  │◄─── CouchDB (read todos/entries)
└─────────────┘     └─────────────┘
                          │
                    ┌─────────────┐
                    │   CouchDB   │  gleaned_subscriptions (DB)
                    └─────────────┘
```

The browser registers its push subscription directly with the pusher via `/push/subscribe`. The pusher stores subscriptions in a dedicated CouchDB database (`gleaned_subscriptions`) separate from the main `gleaned` database.

---

## Prerequisites

- CouchDB sync must be enabled (the pusher reads from CouchDB to check today's entries and due todos)
- HTTPS is required for Web Push — browsers only allow push subscriptions on secure origins

---

## Setup

### 1. Generate VAPID keys

VAPID keys authenticate the push server with browser push services. Generate them once and keep them — rotating them invalidates all existing subscriptions.

```bash
# Option A — using the pusher container (no local Node.js required)
docker compose run --rm pusher node -e "console.log(require('web-push').generateVAPIDKeys())"

# Option B — if you have Node.js locally
node -e "console.log(require('web-push').generateVAPIDKeys())"
```

Output:
```json
{
  "publicKey": "BPxxxxxxx....",
  "privateKey": "xxxxxxx..."
}
```

### 2. Generate SEND_SECRET

`SEND_SECRET` protects the `POST /push/send` endpoint, which can broadcast arbitrary notifications to all subscribers. An empty secret would leave it open to anyone.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Configure `.env`

Add to your `.env` file (copy `.env.example` as a starting point):

```env
VAPID_PUBLIC_KEY=BPxxxxxxx....
VAPID_PRIVATE_KEY=xxxxxxx...
VAPID_SUBJECT=mailto:you@example.com
SEND_SECRET=<64-char hex string from step 2>

# Optional — reminder times (24h, server timezone)
PUSH_HOUR=20
PUSH_MINUTE=0
DUE_HOUR=9
DUE_MINUTE=0
```

### 4. Start

```bash
docker compose up -d
```

The pusher starts on port 3001 (internal only — nginx proxies it under `/push/`). Verify it is running:

```bash
curl http://localhost:3000/push/health
# → {"ok":true}
```

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `VAPID_PUBLIC_KEY` | ✓ | — | VAPID public key (base64url) |
| `VAPID_PRIVATE_KEY` | ✓ | — | VAPID private key (base64url) |
| `VAPID_SUBJECT` | — | `mailto:admin@gleaned.local` | Contact URI sent to push services |
| `SEND_SECRET` | ✓ | — | Auth token for `POST /push/send` |
| `COUCHDB_URL` | — | `http://admin:changeme@couchdb:5984` | Full CouchDB URL including credentials |
| `GLEANED_DB` | — | `gleaned` | Name of the main gleaned database |
| `PUSH_HOUR` | — | `20` | Hour for daily learning reminder (24h) |
| `PUSH_MINUTE` | — | `0` | Minute for daily learning reminder |
| `DUE_HOUR` | — | `9` | Hour for due-date reminder |
| `DUE_MINUTE` | — | `0` | Minute for due-date reminder |
| `PUSH_TZ` | — | Server system timezone | Timezone for cron schedules and "today" comparison |
| `PORT` | — | `3001` | Internal HTTP port |

---

## API endpoints

All endpoints are exposed via nginx at `/push/*`.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/push/health` | none | Liveness check |
| `GET` | `/push/vapid-public-key` | none | Returns `{ publicKey }` — used by the app on subscribe |
| `POST` | `/push/subscribe` | none | Register a push subscription |
| `DELETE` | `/push/subscribe` | none | Remove a push subscription |
| `POST` | `/push/send` | `X-Send-Secret` header | Broadcast a custom notification to all subscribers |

### Manual broadcast

```bash
curl -X POST http://localhost:3000/push/send \
  -H "Content-Type: application/json" \
  -H "X-Send-Secret: <your SEND_SECRET>" \
  -d '{"title": "gleaned", "body": "Test notification"}'
```

---

## Encrypted todos

Todos with encryption enabled have their text stored as ciphertext — the pusher cannot decrypt it. In this case, due-date notifications fall back to count-based summaries ("2 learning goals due today") rather than naming the specific todo. This is by design: the push server must not hold the encryption key.

---

## Subscriptions database

Subscriptions are stored in a separate CouchDB database named `gleaned_subscriptions` (created automatically on first subscribe). The document structure is:

```json
{
  "_id": "<base64url of endpoint, truncated to 64 chars>",
  "endpoint": "https://fcm.googleapis.com/...",
  "keys": { "p256dh": "...", "auth": "..." },
  "lang": "de",
  "tz": "Europe/Berlin",
  "createdAt": "2025-05-22T18:00:00.000Z"
}
```

The pusher automatically removes stale subscriptions (HTTP 410 from the push service means the subscription has been revoked by the browser).
