export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { requireAuth } from "@/app/api/_auth";
import { getDb } from "@/lib/db/server";
import { webauthnChallenges, webauthnCredentials } from "@/lib/db/schema/server/webauthn";

const RP_NAME = "gleaned";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function getRpId(request: NextRequest): string {
  const host = request.headers.get("host") ?? "localhost";
  return host.split(":")[0];
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authResult = requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const db = getDb();

  // Collect already-registered credential IDs to exclude them.
  const existing = db.select({ id: webauthnCredentials.id }).from(webauthnCredentials).all();

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: getRpId(request),
    userName: "gleaned-user",
    userDisplayName: "gleaned",
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.id })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
      authenticatorAttachment: "platform",
    },
    extensions: {
      // PRF: derive a symmetric key from the authenticator secret.
      // The salt is fixed so registration and authentication return the same output.
      prf: { eval: { first: Buffer.from("gleaned-key-wrap-v1").toString("base64") } },
    } as Record<string, unknown>,
  });

  // Persist challenge for verification in /finish.
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
  db.insert(webauthnChallenges)
    .values({ id: options.challenge, type: "register", expires_at: expiresAt })
    .run();

  return NextResponse.json(options);
}
