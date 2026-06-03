export const runtime = "nodejs";

import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/app/api/_auth";
import { readJsonWithLimit, SMALL_BODY_LIMIT } from "@/app/api/_body";
import { getDb } from "@/lib/db/server";
import { push_subscriptions } from "@/lib/db/schema/server/push_subscriptions";

// Push endpoint URLs from real vendors (FCM, APNs, Mozilla) are well under 512
// chars. p256dh is 87 base64url chars (65-byte uncompressed EC key); auth_key
// is 24 base64url chars (16 bytes). These caps prevent unbounded DB writes.
const MAX_ENDPOINT_LEN = 2048;
const MAX_P256DH_LEN   = 256;
const MAX_AUTH_KEY_LEN = 64;

const VALID_TIMEZONES = new Set(Intl.supportedValuesOf("timeZone"));

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const raw = await readJsonWithLimit(request, SMALL_BODY_LIMIT);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;
  const keys = body.keys && typeof body.keys === "object" && !Array.isArray(body.keys)
    ? body.keys as Record<string, unknown>
    : null;

  const endpoint = typeof body.endpoint === "string" ? body.endpoint : undefined;
  const p256dh   = keys && typeof keys.p256dh === "string" ? keys.p256dh : undefined;
  const authKey  = keys && typeof keys.auth === "string" ? keys.auth : undefined;

  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }
  if (endpoint.length > MAX_ENDPOINT_LEN || p256dh.length > MAX_P256DH_LEN || authKey.length > MAX_AUTH_KEY_LEN) {
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

  const raw2 = await readJsonWithLimit(request, SMALL_BODY_LIMIT);
  if (!raw2 || typeof raw2 !== "object" || Array.isArray(raw2)) {
    return NextResponse.json({ error: "missing endpoint" }, { status: 400 });
  }
  const body2 = raw2 as Record<string, unknown>;
  const endpoint = typeof body2.endpoint === "string" ? body2.endpoint : undefined;
  if (!endpoint) return NextResponse.json({ error: "missing endpoint" }, { status: 400 });

  const id = Buffer.from(endpoint).toString("base64url").slice(0, 64);
  getDb().delete(push_subscriptions).where(eq(push_subscriptions.id, id)).run();

  return NextResponse.json({ ok: true });
}
