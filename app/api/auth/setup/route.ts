export const runtime = "nodejs";

import * as argon2 from "argon2";
import { randomBytes, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/server";
import { settings } from "@/lib/db/schema/server/settings";
import { sessions } from "@/lib/db/schema/server/sessions";
import { getClientIp, checkLoginRateLimit, recordLoginFailure } from "@/app/api/_rate-limit";
import { readJsonWithLimit, SMALL_BODY_LIMIT } from "@/app/api/_body";
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
  if (limit.penaltyDelayMs) {
    await new Promise<void>((r) => setTimeout(r, limit.penaltyDelayMs));
  }

  const raw = await readJsonWithLimit(request, SMALL_BODY_LIMIT);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "password, encryptionSalt, and setupToken required" }, { status: 400 });
  }
  const b = raw as Record<string, unknown>;
  if (typeof b.password !== "string" || !b.password ||
      typeof b.encryptionSalt !== "string" || !b.encryptionSalt ||
      typeof b.setupToken !== "string" || !b.setupToken) {
    return NextResponse.json({ error: "password, encryptionSalt, and setupToken required" }, { status: 400 });
  }
  const { password, encryptionSalt, setupToken } = b as { password: string; encryptionSalt: string; setupToken: string };

  const db = getDb();
  const existing = db.select().from(settings).get();
  if (existing?.password_verifier) {
    return NextResponse.json({ error: "Already set up" }, { status: 409 });
  }

  const token = getSetupToken();
  const tokenMatch =
    token !== null &&
    setupToken.length === token.length &&
    timingSafeEqual(Buffer.from(setupToken), Buffer.from(token));
  if (!tokenMatch) {
    recordLoginFailure(ip);
    return NextResponse.json({ error: "Invalid setup token" }, { status: 403 });
  }

  const verifier = await argon2.hash(password, { type: argon2.argon2id });
  const sessionId = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

  db.insert(settings)
    .values({
      id: "gleaned_settings",
      password_verifier: verifier,
      encryption_salt: encryptionSalt,
      encryption_iterations: 600_000,
    })
    .onConflictDoUpdate({
      target: settings.id,
      set: {
        password_verifier: verifier,
        encryption_salt: encryptionSalt,
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
