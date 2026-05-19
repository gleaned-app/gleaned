"use strict";
const express  = require("express");
const webpush  = require("web-push");
const cron     = require("node-cron");
const nano     = require("nano");

// ── Config ───────────────────────────────────────────────────────────────────
const {
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_SUBJECT   = "mailto:admin@gleaned.local",
  COUCHDB_URL     = "http://admin:changeme@couchdb:5984",
  PUSH_HOUR       = "20",
  PUSH_MINUTE     = "0",
  PORT            = "3001",
} = process.env;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required.");
  console.error("Generate them with: node -e \"console.log(require('web-push').generateVAPIDKeys())\"");
  process.exit(1);
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// ── CouchDB ──────────────────────────────────────────────────────────────────
const couch = nano(COUCHDB_URL);
const DB_NAME = "gleaned_subscriptions";

async function getDb() {
  try { await couch.db.create(DB_NAME); } catch (e) { if (e.statusCode !== 412) throw e; }
  return couch.db.use(DB_NAME);
}

// ── Send push to all subscribers ─────────────────────────────────────────────
async function broadcast(payload) {
  const db = await getDb();
  const { rows } = await db.list({ include_docs: true });
  const subs = rows.filter((r) => r.doc && !r.id.startsWith("_design"));
  let sent = 0, failed = 0;

  await Promise.allSettled(
    subs.map(async ({ doc }) => {
      try {
        await webpush.sendNotification(
          { endpoint: doc.endpoint, keys: doc.keys },
          JSON.stringify(payload)
        );
        sent++;
      } catch (err) {
        failed++;
        // 410 Gone = subscription expired, remove it
        if (err.statusCode === 410) {
          try { await db.destroy(doc._id, doc._rev); } catch {}
        }
      }
    })
  );

  return { sent, failed };
}

// ── Express ──────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

app.get("/health", (_, res) => res.json({ ok: true }));

app.get("/vapid-public-key", (_, res) => res.json({ publicKey: VAPID_PUBLIC_KEY }));

// Subscribe
app.post("/subscribe", async (req, res) => {
  const sub = req.body;
  if (!sub?.endpoint || !sub?.keys) return res.status(400).json({ error: "invalid subscription" });
  try {
    const db = await getDb();
    const id = Buffer.from(sub.endpoint).toString("base64url").slice(0, 64);
    try { const existing = await db.get(id); await db.destroy(id, existing._rev); } catch {}
    await db.insert({ endpoint: sub.endpoint, keys: sub.keys, createdAt: new Date().toISOString() }, id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Unsubscribe
app.delete("/subscribe", async (req, res) => {
  const { endpoint } = req.body ?? {};
  if (!endpoint) return res.status(400).json({ error: "missing endpoint" });
  try {
    const db = await getDb();
    const id = Buffer.from(endpoint).toString("base64url").slice(0, 64);
    const doc = await db.get(id);
    await db.destroy(id, doc._rev);
  } catch {}
  res.json({ ok: true });
});

// Manual send (for testing: POST /send with optional JSON body)
app.post("/send", async (req, res) => {
  const payload = {
    title: "gleaned",
    body: "Was hast du heute gelernt?",
    url: "/",
    ...req.body,
  };
  const result = await broadcast(payload).catch((e) => ({ error: e.message }));
  res.json(result);
});

// ── Daily reminder cron ───────────────────────────────────────────────────────
cron.schedule(`${PUSH_MINUTE} ${PUSH_HOUR} * * *`, async () => {
  console.log(`[${new Date().toISOString()}] Sending daily reminder...`);
  const result = await broadcast({ title: "gleaned", body: "Was hast du heute gelernt?", url: "/" });
  console.log(`Sent: ${result.sent} ok, ${result.failed} failed`);
});

app.listen(Number(PORT), () => {
  console.log(`gleaned pusher running on :${PORT}`);
  console.log(`Daily reminder scheduled at ${PUSH_HOUR}:${PUSH_MINUTE.padStart(2, "0")}`);
});
