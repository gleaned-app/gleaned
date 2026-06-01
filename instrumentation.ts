export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { initSetupToken } = await import("./lib/setup-token.server");
  initSetupToken();

  if (process.env.NODE_ENV === "production" && !process.env.DB_PATH) {
    console.warn(
      "\n[gleaned] WARNING: DB_PATH is not set.\n" +
      "[gleaned]   Defaulting to ./gleaned.db (relative to the server CWD).\n" +
      "[gleaned]   In Docker the CWD is /app, so data goes to /app/gleaned.db —\n" +
      "[gleaned]   NOT the /data volume mount. Data will be lost on container restart.\n" +
      "[gleaned]   Set DB_PATH=/data/gleaned.db and mount a volume at /data.\n",
    );
  }

  if (process.env.TRUST_PROXY !== "true" && process.env.TRUST_PROXY !== "false") {
    console.warn(
      "\n[gleaned] WARNING: TRUST_PROXY is not set.\n" +
      "[gleaned]   Rate limiting falls back to the raw socket IP (safe for direct access).\n" +
      "[gleaned]   If gleaned is behind a reverse proxy (Traefik, nginx, Caddy), set\n" +
      "[gleaned]   TRUST_PROXY=true so brute-force protection targets the real client IP.\n" +
      "[gleaned]   Set TRUST_PROXY=false to silence this warning when running directly.\n",
    );
  }

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

  const { default: cron } = await import("node-cron");
  const { sendDailyReminder, sendDueReminders } = await import("./lib/push/scheduler");

  const rawTz = process.env.PUSH_TZ ?? "UTC";

  const validTimezones = Intl.supportedValuesOf("timeZone");
  const tz = validTimezones.includes(rawTz) ? rawTz : "UTC";
  if (tz !== rawTz) {
    console.warn(`[push] Invalid PUSH_TZ "${rawTz}", falling back to UTC`);
  }

  function parseCronField(val: string | undefined, min: number, max: number, fallback: number): number {
    const n = parseInt(val ?? "", 10);
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  }

  const pushHour = parseCronField(process.env.PUSH_HOUR,   0, 23, 20);
  const pushMin  = parseCronField(process.env.PUSH_MINUTE, 0, 59,  0);
  const dueHour  = parseCronField(process.env.DUE_HOUR,    0, 23,  9);
  const dueMin   = parseCronField(process.env.DUE_MINUTE,  0, 59,  0);

  cron.schedule(`${pushMin} ${pushHour} * * *`, () => {
    sendDailyReminder().catch((e: unknown) =>
      console.error("[push] daily reminder failed:", e),
    );
  }, { timezone: tz });

  cron.schedule(`${dueMin} ${dueHour} * * *`, () => {
    sendDueReminders().catch((e: unknown) =>
      console.error("[push] due reminder failed:", e),
    );
  }, { timezone: tz });

  console.log(`[push] cron scheduled — daily ${pushHour}:${pushMin}, due ${dueHour}:${dueMin} (${tz})`);
}
