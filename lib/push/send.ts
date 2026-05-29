import webpush from "web-push";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/server";
import { push_subscriptions } from "@/lib/db/schema/server/push_subscriptions";

let _initialized = false;

function init() {
  if (_initialized) return;
  const pub  = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@gleaned.local",
    pub,
    priv,
  );
  _initialized = true;
}

export type PushPayload = { title: string; body: string; url?: string };
export type PayloadBuilder = (lang: string) => PushPayload;

export async function broadcast(buildPayload: PushPayload | PayloadBuilder): Promise<{ sent: number; failed: number }> {
  init();
  if (!_initialized) return { sent: 0, failed: 0 };

  const db   = getDb();
  const subs = db.select().from(push_subscriptions).all();
  let sent = 0, failed = 0;

  await Promise.allSettled(
    subs.map(async (sub) => {
      const lang    = sub.lang === "en" ? "en" : "de";
      const payload = typeof buildPayload === "function" ? buildPayload(lang) : buildPayload;
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          JSON.stringify(payload),
        );
        sent++;
      } catch (err: unknown) {
        failed++;
        // 410 Gone = browser revoked the subscription
        if ((err as { statusCode?: number }).statusCode === 410) {
          try { db.delete(push_subscriptions).where(eq(push_subscriptions.id, sub.id)).run(); } catch {}
        }
      }
    }),
  );

  return { sent, failed };
}
