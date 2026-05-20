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
  DUE_HOUR        = "9",
  DUE_MINUTE      = "0",
  GLEANED_DB      = "gleaned",
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

async function getSubsDb() {
  try { await couch.db.create(DB_NAME); } catch (e) { if (e.statusCode !== 412) throw e; }
  return couch.db.use(DB_NAME);
}

// ── Send push to all subscribers ─────────────────────────────────────────────
async function broadcast(payload) {
  const db = await getSubsDb();
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
        if (err.statusCode === 410) {
          try { await db.destroy(doc._id, doc._rev); } catch {}
        }
      }
    })
  );

  return { sent, failed };
}

// ── Due-date reminder ─────────────────────────────────────────────────────────
async function sendDueReminders() {
  // Gracefully skip if the gleaned DB doesn't exist yet (CouchDB sync not set up)
  let db;
  try {
    db = couch.db.use(GLEANED_DB);
    await db.info();
  } catch {
    return;
  }

  const today = new Date().toISOString().split("T")[0];

  // Fetch all todos — filter in JS to avoid needing a dueDate index
  const result = await db.find({
    selector: { type: "todo" },
    fields: ["_id", "text", "dueDate", "done"],
    limit: 1000,
  });

  const due = (result.docs ?? []).filter(
    (d) => !d.done && d.dueDate && d.dueDate <= today
  );
  if (!due.length) return;

  const overdue   = due.filter((d) => d.dueDate < today);
  const dueToday  = due.filter((d) => d.dueDate === today);

  let body;
  if (dueToday.length === 1 && overdue.length === 0) {
    body = `Heute fällig: ${dueToday[0].text}`;
  } else if (dueToday.length > 0 && overdue.length === 0) {
    body = `${dueToday.length} Lernziele heute fällig`;
  } else if (dueToday.length === 0 && overdue.length === 1) {
    body = `Überfällig: ${overdue[0].text}`;
  } else {
    const parts = [];
    if (dueToday.length) parts.push(`${dueToday.length} heute fällig`);
    if (overdue.length)  parts.push(`${overdue.length} überfällig`);
    body = parts.join(", ");
  }

  console.log(`[${new Date().toISOString()}] Due reminder: ${body}`);
  const result2 = await broadcast({ title: "gleaned · Lernziele", body, url: "/" });
  console.log(`Sent: ${result2.sent} ok, ${result2.failed} failed`);
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
    const db = await getSubsDb();
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
    const db = await getSubsDb();
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

// ── Daily learning reminder ───────────────────────────────────────────────────
cron.schedule(`${PUSH_MINUTE} ${PUSH_HOUR} * * *`, async () => {
  console.log(`[${new Date().toISOString()}] Sending daily reminder...`);
  const result = await broadcast({ title: "gleaned", body: "Was hast du heute gelernt?", url: "/" });
  console.log(`Sent: ${result.sent} ok, ${result.failed} failed`);
});

// ── Due-date reminder (runs once daily, default 09:00) ────────────────────────
cron.schedule(`${DUE_MINUTE} ${DUE_HOUR} * * *`, async () => {
  console.log(`[${new Date().toISOString()}] Checking due todos...`);
  await sendDueReminders().catch((e) => console.error("Due reminders failed:", e.message));
});

app.listen(Number(PORT), () => {
  console.log(`gleaned pusher running on :${PORT}`);
  console.log(`Daily reminder scheduled at ${PUSH_HOUR}:${PUSH_MINUTE.padStart(2, "0")}`);
  console.log(`Due-date reminder scheduled at ${DUE_HOUR}:${DUE_MINUTE.padStart(2, "0")}`);
});
