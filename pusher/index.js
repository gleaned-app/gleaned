"use strict";
const { timingSafeEqual } = require("node:crypto");
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
  SEND_SECRET     = "",
  PUSH_TZ         = Intl.DateTimeFormat().resolvedOptions().timeZone,
} = process.env;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required.");
  console.error("Generate them with: node -e \"console.log(require('web-push').generateVAPIDKeys())\"");
  process.exit(1);
}

if (!SEND_SECRET) {
  console.error("SEND_SECRET is required — an empty secret disables auth on POST /send,");
  console.error("allowing anyone who discovers the endpoint to broadcast push notifications.");
  console.error("Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
  process.exit(1);
}

// Returns YYYY-MM-DD in the configured timezone (PUSH_TZ env var, defaults to
// server system locale). Using toISOString() gives UTC and misidentifies "today"
// for users in UTC+ zones when crons fire near midnight.
function localDateStr() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PUSH_TZ }).format(new Date());
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// ── CouchDB ──────────────────────────────────────────────────────────────────
const couch = nano(COUCHDB_URL);
const DB_NAME = "gleaned_subscriptions";

async function getSubsDb() {
  try { await couch.db.create(DB_NAME); } catch (e) { if (e.statusCode !== 412) throw e; }
  return couch.db.use(DB_NAME);
}

// ── Localized notification strings ───────────────────────────────────────────
const MSG = {
  de: {
    dailyTitle: "gleaned",
    dailyBody:  "Was hast du heute gelernt?",
    dueTitle:   "gleaned · Lernziele",
    dueToday1:  (text) => `Heute fällig: ${text}`,
    dueTodayN:  (n)    => `${n} Lernziele heute fällig`,
    overdue1:   (text) => `Überfällig: ${text}`,
    mixed:      (today, over) => [today && `${today} heute fällig`, over && `${over} überfällig`].filter(Boolean).join(", "),
  },
  en: {
    dailyTitle: "gleaned",
    dailyBody:  "What did you learn today?",
    dueTitle:   "gleaned · Learning goals",
    dueToday1:  (text) => `Due today: ${text}`,
    dueTodayN:  (n)    => `${n} learning goals due today`,
    overdue1:   (text) => `Overdue: ${text}`,
    mixed:      (today, over) => [today && `${today} due today`, over && `${over} overdue`].filter(Boolean).join(", "),
  },
};

// ── Send push to all subscribers ─────────────────────────────────────────────
async function broadcast(buildPayload) {
  const db = await getSubsDb();
  const { rows } = await db.list({ include_docs: true });
  const subs = rows.filter((r) => r.doc && !r.id.startsWith("_design"));
  let sent = 0, failed = 0;

  await Promise.allSettled(
    subs.map(async ({ doc }) => {
      const lang = doc.lang === "en" ? "en" : "de";
      const payload = typeof buildPayload === "function" ? buildPayload(lang) : buildPayload;
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
// Threat model: todos are NOT end-to-end encrypted. The pusher reads todo text
// directly from CouchDB to compose meaningful notification bodies. This is an
// intentional design trade-off — the server must know what is due to name it in
// the notification. Users who consider todo text sensitive can disable due-date
// notifications in Settings.
async function sendDueReminders() {
  // Gracefully skip if the gleaned DB doesn't exist yet (CouchDB sync not set up)
  let db;
  try {
    db = couch.db.use(GLEANED_DB);
    await db.info();
  } catch {
    return;
  }

  const today = localDateStr();

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

  const overdue  = due.filter((d) => d.dueDate < today);
  const dueToday = due.filter((d) => d.dueDate === today);

  const buildPayload = (lang) => {
    const m = MSG[lang] ?? MSG.en;
    let body;
    if (dueToday.length === 1 && overdue.length === 0) {
      body = m.dueToday1(dueToday[0].text);
    } else if (dueToday.length > 0 && overdue.length === 0) {
      body = m.dueTodayN(dueToday.length);
    } else if (dueToday.length === 0 && overdue.length === 1) {
      body = m.overdue1(overdue[0].text);
    } else {
      body = m.mixed(dueToday.length || null, overdue.length || null);
    }
    return { title: m.dueTitle, body, url: "/" };
  };

  console.log(`[${new Date().toISOString()}] Due reminder (${due.length} todos)`);
  const result2 = await broadcast(buildPayload);
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
    await db.insert({ endpoint: sub.endpoint, keys: sub.keys, lang: sub.lang || "en", tz: sub.tz || PUSH_TZ, createdAt: new Date().toISOString() }, id);
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

// Manual send (protected by SEND_SECRET if set)
app.post("/send", async (req, res) => {
  const provided = String(req.headers["x-send-secret"] ?? "");
  const authorized =
    provided.length === SEND_SECRET.length &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(SEND_SECRET));
  if (!authorized) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const override = req.body ?? {};
  const buildPayload = (lang) => ({
    title: MSG[lang]?.dailyTitle ?? "gleaned",
    body: MSG[lang]?.dailyBody ?? "What did you learn today?",
    url: "/",
    ...override,
  });
  const result = await broadcast(buildPayload).catch((e) => ({ error: e.message }));
  res.json(result);
});

// ── Daily learning reminder ───────────────────────────────────────────────────
// Only fires if no entry was written today — avoids guilt-pinging users who
// already used the app.
async function hasEntryToday() {
  try {
    const db = couch.db.use(GLEANED_DB);
    await db.info();
    const today = localDateStr();
    const result = await db.find({
      selector: { type: "entry", date: today },
      fields: ["_id"],
      limit: 1,
    });
    return (result.docs ?? []).length > 0;
  } catch {
    return false;
  }
}

cron.schedule(`${PUSH_MINUTE} ${PUSH_HOUR} * * *`, async () => {
  if (await hasEntryToday()) {
    console.log(`[${new Date().toISOString()}] Daily reminder skipped — entry already written today`);
    return;
  }
  console.log(`[${new Date().toISOString()}] Sending daily reminder...`);
  const result = await broadcast((lang) => ({
    title: MSG[lang]?.dailyTitle ?? "gleaned",
    body:  MSG[lang]?.dailyBody  ?? "What did you learn today?",
    url:   "/",
  }));
  console.log(`Sent: ${result.sent} ok, ${result.failed} failed`);
}, { timezone: PUSH_TZ });

// ── Due-date reminder (runs once daily, default 09:00) ────────────────────────
cron.schedule(`${DUE_MINUTE} ${DUE_HOUR} * * *`, async () => {
  console.log(`[${new Date().toISOString()}] Checking due todos...`);
  await sendDueReminders().catch((e) => console.error("Due reminders failed:", e.message));
}, { timezone: PUSH_TZ });

app.listen(Number(PORT), () => {
  console.log(`gleaned pusher running on :${PORT}`);
  console.log(`Daily reminder scheduled at ${PUSH_HOUR}:${PUSH_MINUTE.padStart(2, "0")}`);
  console.log(`Due-date reminder scheduled at ${DUE_HOUR}:${DUE_MINUTE.padStart(2, "0")}`);
});
