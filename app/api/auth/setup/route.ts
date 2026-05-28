export const runtime = "nodejs";

import * as argon2 from "argon2";
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/server";
import { settings } from "@/lib/db/schema/server/settings";
import { sessions } from "@/lib/db/schema/server/sessions";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null);
  if (!body?.password || !body?.encryptionSalt) {
    return NextResponse.json({ error: "password and encryptionSalt required" }, { status: 400 });
  }

  const db = getDb();
  const existing = db.select().from(settings).get();
  if (existing?.password_verifier) {
    return NextResponse.json({ error: "Already set up" }, { status: 409 });
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

  const response = NextResponse.json({ ok: true });
  response.cookies.set("sid", sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return response;
}
