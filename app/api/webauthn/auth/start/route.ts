export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { lt } from "drizzle-orm";
import { getDb } from "@/lib/db/server";
import { webauthnChallenges, webauthnCredentials } from "@/lib/db/schema/server/webauthn";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function getRpId(request: NextRequest): string {
  const host = request.headers.get("host") ?? "localhost";
  return host.split(":")[0];
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const db = getDb();

  const credentials = db.select({ id: webauthnCredentials.id }).from(webauthnCredentials).all();
  if (credentials.length === 0) {
    return NextResponse.json({ error: "no credentials registered" }, { status: 404 });
  }

  // Sweep expired challenges.
  db.delete(webauthnChallenges).where(lt(webauthnChallenges.expires_at, new Date().toISOString())).run();

  const options = await generateAuthenticationOptions({
    rpID: getRpId(request),
    allowCredentials: credentials.map((c) => ({ id: c.id })),
    userVerification: "required",
    extensions: {
      prf: { eval: { first: Buffer.from("gleaned-key-wrap-v1").toString("base64") } },
    } as Record<string, unknown>,
  });

  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
  db.insert(webauthnChallenges)
    .values({ id: options.challenge, type: "authenticate", expires_at: expiresAt })
    .run();

  return NextResponse.json(options);
}
