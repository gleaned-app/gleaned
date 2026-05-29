# Push Notifications

gleaned supports optional Web Push notifications for two daily reminders:

- **Daily learning reminder** — fires once a day (default 20:00) if no entry has been written yet that day
- **Due-date reminder** — fires once a day (default 09:00) listing todos that are due today or overdue

Both are opt-in per browser via **Settings → Notifications**. Push notifications require HTTPS.

---

## How it works

Push notification scheduling runs inside the gleaned server process using `node-cron` and `instrumentation.ts`. No separate container is needed. Subscriptions are stored in the same SQLite database as entries and threads.

```
Browser
  │  (1) subscribe → POST /api/push/subscribe
  │  (2) receive Web Push ← gleaned server (node-cron fires, web-push sends)
  ▼
gleaned (Next.js, port 3000)
  ├── /api/push/vapid-key   ← returns VAPID public key
  ├── /api/push/subscribe   ← register / remove subscription
  ├── /api/push/send        ← manual broadcast (X-Send-Secret auth)
  └── instrumentation.ts   ← cron: daily + due-date reminders
        └── lib/push/scheduler.ts ← SQLite queries, broadcast()
              └── lib/push/send.ts ← web-push wrapper
```

---

## Setup

### 1. Generate VAPID keys

VAPID keys authenticate the push server with browser push services. Generate them once and keep them — rotating them invalidates all existing subscriptions.

```bash
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

`SEND_SECRET` protects `POST /api/push/send`, which broadcasts arbitrary notifications to all subscribers.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Configure .env

```env
VAPID_PUBLIC_KEY=BPxxxxxxx....
VAPID_PRIVATE_KEY=xxxxxxx...
VAPID_SUBJECT=mailto:you@example.com
SEND_SECRET=<64-char hex string from step 2>

# Optional — reminder times (24h) and timezone
PUSH_HOUR=20
PUSH_MINUTE=0
DUE_HOUR=9
DUE_MINUTE=0
PUSH_TZ=Europe/Berlin
```

If `VAPID_PUBLIC_KEY` or `VAPID_PRIVATE_KEY` are not set, push notifications are silently disabled — the cron is not scheduled and the subscribe endpoint returns `{ available: false }`.

### 4. Start

```bash
docker compose -f docker/compose.traefik.yml up -d
# or
docker compose -f docker/compose.yml up -d
```

---

## API endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/push/vapid-key` | none | Returns `{ publicKey }` or `{ available: false }` |
| `POST` | `/api/push/subscribe` | session cookie | Register a push subscription |
| `DELETE` | `/api/push/subscribe` | session cookie | Remove a push subscription |
| `POST` | `/api/push/send` | `X-Send-Secret` header | Broadcast a custom notification |

### Manual broadcast

```bash
curl -X POST https://your-domain.com/api/push/send \
  -H "Content-Type: application/json" \
  -H "X-Send-Secret: <your SEND_SECRET>" \
  -d '{"title": "gleaned", "body": "Test notification"}'
```

---

## Encrypted todos

Todos are end-to-end encrypted — the server stores only ciphertext. Due-date notifications use count-based summaries ("2 learning goals due today") rather than naming specific todos. The `due_date` and `done` fields are stored in plaintext and are used for scheduling.
