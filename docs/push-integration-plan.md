# Plan: Pusher → instrumentation.ts

## What gets removed
- `pusher/` (entire directory)
- `docker/nginx.conf` + `docker/nginx-entrypoint.sh` (leftover from static-export era, not referenced in current compose)
- `pusher` service in both compose files

## What gets added
- `lib/db/schema/server/push_subscriptions.ts` — Drizzle table
- `lib/db/migrations/` — generated migration
- `lib/push/send.ts` — web-push wrapper + broadcast()
- `lib/push/scheduler.ts` — cron logic with direct SQLite queries
- `instrumentation.ts` — node-cron registered at Next.js startup
- `app/api/push/vapid-key/route.ts` — GET, public
- `app/api/push/subscribe/route.ts` — POST + DELETE, session auth
- `app/api/push/send/route.ts` — POST, SEND_SECRET auth

## Steps

### 1 — Dependencies
Add to package.json:
- `web-push` → dependencies
- `node-cron` → dependencies
- `@types/web-push` → devDependencies

### 2 — Drizzle schema
New file `lib/db/schema/server/push_subscriptions.ts`:
```ts
sqliteTable("push_subscriptions", {
  id:         text("id").primaryKey(),       // base64url(endpoint).slice(0, 64)
  endpoint:   text("endpoint").notNull(),
  p256dh:     text("p256dh").notNull(),
  auth_key:   text("auth_key").notNull(),    // "auth" is SQL-reserved
  lang:       text("lang").notNull().default("en"),
  tz:         text("tz").notNull().default("UTC"),
  created_at: text("created_at").notNull(),
})
```
Then: `pnpm drizzle-kit generate` → commit migration.

### 3 — lib/push/send.ts
- VAPID init once from process.env
- broadcast(buildPayload) — loads all subscriptions from SQLite, sends web-push, auto-removes 410s
- Guard: if VAPID_PUBLIC_KEY not set → silent no-op

### 4 — lib/push/scheduler.ts
Two functions with direct getDb():

sendDailyReminder():
  SELECT COUNT(*) FROM entries WHERE date = <today>
  → if 0 entries: broadcast "What did you learn today?"

sendDueReminders():
  SELECT * FROM threads WHERE done = 0 AND due_date <= <today>
  → count overdue / due-today, build count-only payload (data_enc is encrypted)

### 5 — instrumentation.ts
```ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.VAPID_PUBLIC_KEY) return;  // push is optional

  const cron = await import("node-cron");
  const { sendDailyReminder, sendDueReminders } = await import("./lib/push/scheduler");

  const tz = process.env.PUSH_TZ ?? "UTC";
  cron.schedule(`${PUSH_MIN} ${PUSH_HOUR} * * *`, sendDailyReminder, { timezone: tz });
  cron.schedule(`${DUE_MIN}  ${DUE_HOUR}  * * *`, sendDueReminders,  { timezone: tz });
}
```
No HTTP overhead, direct DB access, lives in the same Node.js process.

### 6 — API routes

GET /api/push/vapid-key — public, no auth:
  returns { publicKey: "BP..." } or { available: false }

POST /api/push/subscribe — requireAuth:
  writes subscription to push_subscriptions

DELETE /api/push/subscribe — requireAuth:
  deletes subscription

POST /api/push/send — X-Send-Secret header:
  manual broadcast, same logic as broadcast() with free payload

### 7 — Client updates

lib/notifications.ts:
  PUSH_BASE = "/push" → "/api/push"

public/sw.js cache-bypass rule:
  "/push/" → "/api/push/"

### 8 — Docker

compose.yml + compose.traefik.yml:
- remove pusher service entirely
- add to app service env:
    VAPID_PRIVATE_KEY: ${VAPID_PRIVATE_KEY:-}
    VAPID_SUBJECT: ${VAPID_SUBJECT:-mailto:admin@gleaned.local}
    SEND_SECRET: ${SEND_SECRET:-}
    PUSH_HOUR: ${PUSH_HOUR:-20}
    PUSH_MINUTE: ${PUSH_MINUTE:-0}
    DUE_HOUR: ${DUE_HOUR:-9}
    DUE_MINUTE: ${DUE_MINUTE:-0}
    PUSH_TZ: ${PUSH_TZ:-UTC}

docker/.env.example:
- remove CouchDB lines
- update VAPID generation hint (no docker run needed, just node)
- add PUSH_TZ

docker/setup.sh:
- generate VAPID via node directly (no longer needs gleaned-pusher image)
- remove COUCHDB_PASSWORD mention from final message

### 9 — Cleanup
git rm -r pusher/
git rm docker/nginx.conf docker/nginx-entrypoint.sh

pusher/README.md content → docs/push-notifications.md (updated for new architecture)

### 10 — CHANGELOG
New version 0.4.0:
- push notifications integrated into main app (no separate container)
- subscriptions stored in SQLite, backed up automatically with gleaned.db
- removed CouchDB/PouchDB dependency entirely

## Commit order
1. deps + schema + migration
2. lib/push/ + instrumentation.ts
3. api routes
4. client updates (notifications.ts + sw.js)
5. docker cleanup + env
6. delete pusher/ + nginx leftovers
7. docs/push-notifications.md + changelog
