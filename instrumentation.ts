export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { initSetupToken } = await import("./lib/setup-token.server");
  initSetupToken();

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

  const { default: cron } = await import("node-cron");
  const { sendDailyReminder, sendDueReminders } = await import("./lib/push/scheduler");

  const rawTz    = process.env.PUSH_TZ    ?? "UTC";
  const pushHour = process.env.PUSH_HOUR  ?? "20";
  const pushMin  = process.env.PUSH_MINUTE ?? "0";
  const dueHour  = process.env.DUE_HOUR   ?? "9";
  const dueMin   = process.env.DUE_MINUTE ?? "0";

  const validTimezones = Intl.supportedValuesOf("timeZone");
  const tz = validTimezones.includes(rawTz) ? rawTz : "UTC";
  if (tz !== rawTz) {
    console.warn(`[push] Invalid PUSH_TZ "${rawTz}", falling back to UTC`);
  }

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
