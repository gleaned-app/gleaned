export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { eq, lt } from "drizzle-orm";
import { requireAuth } from "@/app/api/_auth";
import { readJsonWithLimit, WEBAUTHN_BODY_LIMIT } from "@/app/api/_body";
import { getDb } from "@/lib/db/server";
import { webauthnChallenges, webauthnCredentials } from "@/lib/db/schema/server/webauthn";
import { writeAudit } from "@/lib/db/audit";

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
  const authResult = requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const raw = await readJsonWithLimit(request, WEBAUTHN_BODY_LIMIT);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = raw as Record<string, any>;
  if (!body.credential || typeof body.keyBlob !== "string") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  // keyBlob is an encrypted key stored in the DB — cap to prevent unbounded writes.
  // A real PRF-wrapped AES-GCM key is under 200 chars as base64; 4096 is generous.
  if (body.keyBlob.length > 4096) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const db = getDb();

  // Sweep expired challenges.
  db.delete(webauthnChallenges).where(lt(webauthnChallenges.expires_at, new Date().toISOString())).run();

  // Look up the challenge that was sent during /start.
  const challengeRow = db
    .select()
    .from(webauthnChallenges)
    .where(eq(webauthnChallenges.id, body.credential.response?.clientDataJSON
      ? (() => {
          try {
            const decoded = Buffer.from(body.credential.response.clientDataJSON, "base64url").toString("utf8");
            return JSON.parse(decoded).challenge as string;
          } catch { return ""; }
        })()
      : ""))
    .get();

  if (!challengeRow || challengeRow.type !== "register") {
    return NextResponse.json({ error: "invalid or expired challenge" }, { status: 400 });
  }

  const rpID = getRpId(request);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.credential,
      expectedChallenge: challengeRow.id,
      expectedOrigin: getOrigin(request),
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "verification failed" }, { status: 400 });
  }

  const { credential, aaguid } = verification.registrationInfo;

  // Remove used challenge.
  db.delete(webauthnChallenges).where(eq(webauthnChallenges.id, challengeRow.id)).run();

  const deviceName: string = typeof body.deviceName === "string" ? body.deviceName.slice(0, 64) : "";

  const now = new Date().toISOString();

  db.insert(webauthnCredentials)
    .values({
      id:          credential.id,
      public_key:  Buffer.from(credential.publicKey).toString("base64"),
      sign_count:  credential.counter,
      device_name: deviceName,
      key_blob:    body.keyBlob,
      created_at:  now,
    })
    .run();

  writeAudit("webauthn.credential.registered", {
    credential_id: credential.id,
    device_name:   deviceName,
    aaguid:        aaguid ?? null,
    session_id:    authResult.sessionId,
  });

  return NextResponse.json({ ok: true, aaguid: aaguid ?? null });
}
