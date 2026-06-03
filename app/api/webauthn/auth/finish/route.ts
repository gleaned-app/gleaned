export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { eq, lt } from "drizzle-orm";
import { randomBytes } from "crypto";
import { readJsonWithLimit, WEBAUTHN_BODY_LIMIT } from "@/app/api/_body";
import { getDb } from "@/lib/db/server";
import { webauthnChallenges, webauthnCredentials } from "@/lib/db/schema/server/webauthn";
import { sessions } from "@/lib/db/schema/server/sessions";
import { secureCookie } from "@/app/api/_cookie";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function getRpId(request: NextRequest): string {
  const host = request.headers.get("host") ?? "localhost";
  return host.split(":")[0];
}

function getOrigin(request: NextRequest): string {
  const origin = request.headers.get("origin");
  if (origin) return origin;
  const host = request.headers.get("host") ?? "localhost";
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const raw = await readJsonWithLimit(request, WEBAUTHN_BODY_LIMIT);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = raw as Record<string, any>;
  if (!body.credential) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const db = getDb();

  // Sweep expired challenges.
  db.delete(webauthnChallenges).where(lt(webauthnChallenges.expires_at, new Date().toISOString())).run();

  // Extract challenge from the assertion's clientDataJSON.
  let challenge: string;
  try {
    const decoded = Buffer.from(body.credential.response.clientDataJSON, "base64url").toString("utf8");
    challenge = JSON.parse(decoded).challenge as string;
  } catch {
    return NextResponse.json({ error: "invalid clientDataJSON" }, { status: 400 });
  }

  const challengeRow = db
    .select()
    .from(webauthnChallenges)
    .where(eq(webauthnChallenges.id, challenge))
    .get();

  if (!challengeRow || challengeRow.type !== "authenticate") {
    return NextResponse.json({ error: "invalid or expired challenge" }, { status: 400 });
  }

  const credRow = db
    .select()
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.id, body.credential.id))
    .get();

  if (!credRow) {
    return NextResponse.json({ error: "credential not found" }, { status: 404 });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.credential,
      expectedChallenge: challengeRow.id,
      expectedOrigin: getOrigin(request),
      expectedRPID: getRpId(request),
      requireUserVerification: true,
      credential: {
        id:        credRow.id,
        publicKey: Buffer.from(credRow.public_key, "base64"),
        counter:   credRow.sign_count,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }

  if (!verification.verified) {
    return NextResponse.json({ error: "verification failed" }, { status: 401 });
  }

  // Update sign counter (replay-attack protection).
  db.update(webauthnCredentials)
    .set({ sign_count: verification.authenticationInfo.newCounter })
    .where(eq(webauthnCredentials.id, credRow.id))
    .run();

  // Remove used challenge.
  db.delete(webauthnChallenges).where(eq(webauthnChallenges.id, challengeRow.id)).run();

  // Create session.
  const sessionId = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  db.insert(sessions)
    .values({ id: sessionId, created_at: now.toISOString(), expires_at: expiresAt })
    .run();

  const response = NextResponse.json({ ok: true, keyBlob: credRow.key_blob });
  response.cookies.set("sid", sessionId, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return response;
}
