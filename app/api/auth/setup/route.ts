export const runtime = "nodejs";

import * as argon2 from "argon2";
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/server";
import { settings } from "@/lib/db/schema/server/settings";
import { sessions } from "@/lib/db/schema/server/sessions";
import { getClientIp, checkLoginRateLimit, recordLoginFailure } from "@/app/api/_rate-limit";
import { getSetupToken, consumeSetupToken } from "@/lib/setup-token.server";
import { secureCookie } from "@/app/api/_cookie";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(request);
  const limit = checkLoginRateLimit(ip);
  if (limit.limited) {
    const retryAfterSecs = Math.ceil((limit.retryAfterMs ?? 15 * 60 * 1000) / 1000);
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSecs) } },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body?.password || !body?.encryptionSalt || !body?.setupToken) {
    return NextResponse.json({ error: "password, encryptionSalt, and setupToken required" }, { status: 400 });
  }

  const db = getDb();
  const existing = db.select().from(settings).get();
  if (existing?.password_verifier) {
    return NextResponse.json({ error: "Already set up" }, { status: 409 });
  }

  const token = getSetupToken();
  if (!token || body.setupToken !== token) {
    recordLoginFailure(ip);
    return NextResponse.json({ error: "Invalid setup token" }, { status: 403 });
  }

  const verifier = await argon2.hash(body.password, { type: argon2.argon2id });
  const sessionId = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

  db.insert(settings)
    .values({
      id: "gleaned_settings",
      password_verifier: verifier,
      encryption_salt: body.encryptionSalt,
      encryption_iterations: 600_000,
    })
    .onConflictDoUpdate({
      target: settings.id,
      set: {
        password_verifier: verifier,
        encryption_salt: body.encryptionSalt,
        encryption_iterations: 600_000,
      },
    })
    .run();

  db.insert(sessions)
    .values({ id: sessionId, created_at: now.toISOString(), expires_at: expiresAt })
    .run();

  consumeSetupToken();

  const response = NextResponse.json({ ok: true });
  response.cookies.set("sid", sessionId, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return response;
}
