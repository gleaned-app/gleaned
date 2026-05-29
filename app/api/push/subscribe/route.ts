export const runtime = "nodejs";

import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/app/api/_auth";
import { getDb } from "@/lib/db/server";
import { push_subscriptions } from "@/lib/db/schema/server/push_subscriptions";

const VALID_TIMEZONES = new Set(Intl.supportedValuesOf("timeZone"));

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => null);
  const endpoint = body?.endpoint as string | undefined;
  const p256dh   = body?.keys?.p256dh as string | undefined;
  const authKey  = body?.keys?.auth as string | undefined;

  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }

  const id         = Buffer.from(endpoint).toString("base64url").slice(0, 64);
  const lang       = (body.lang as string | undefined) === "en" ? "en" : "de";
  const rawTz      = (body.tz as string | undefined) ?? "UTC";
  const tz         = VALID_TIMEZONES.has(rawTz) ? rawTz : "UTC";
  const created_at = new Date().toISOString();

  const db = getDb();
  db.delete(push_subscriptions).where(eq(push_subscriptions.id, id)).run();
  db.insert(push_subscriptions).values({ id, endpoint, p256dh, auth_key: authKey, lang, tz, created_at }).run();

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body     = await request.json().catch(() => null);
  const endpoint = body?.endpoint as string | undefined;
  if (!endpoint) return NextResponse.json({ error: "missing endpoint" }, { status: 400 });

  const id = Buffer.from(endpoint).toString("base64url").slice(0, 64);
  getDb().delete(push_subscriptions).where(eq(push_subscriptions.id, id)).run();

  return NextResponse.json({ ok: true });
}
