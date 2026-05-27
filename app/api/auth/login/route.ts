export const runtime = "nodejs";

import * as argon2 from "argon2";
import { randomBytes } from "crypto";
import { lt } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/server";
import { settings } from "@/lib/db/schema/server/settings";
import { sessions } from "@/lib/db/schema/server/sessions";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null);
  if (!body?.password) {
    return NextResponse.json({ error: "password required" }, { status: 400 });
  }

  const db = getDb();
  const row = db.select().from(settings).get();
  if (!row?.password_verifier || !row?.encryption_salt) {
    return NextResponse.json({ error: "Not set up" }, { status: 404 });
  }

  const valid = await argon2.verify(row.password_verifier, body.password);
  if (!valid) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  // Sweep expired sessions on the busiest endpoint — cheap and sufficient.
  db.delete(sessions).where(lt(sessions.expires_at, new Date().toISOString())).run();

  const sessionId = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

  db.insert(sessions)
    .values({ id: sessionId, created_at: now.toISOString(), expires_at: expiresAt })
    .run();

  const response = NextResponse.json({
    ok: true,
    encryptionSalt: row.encryption_salt,
    encryptionIterations: row.encryption_iterations,
  });
  response.cookies.set("sid", sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return response;
}
