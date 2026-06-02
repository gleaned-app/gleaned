export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/app/api/_auth";
import { getDb } from "@/lib/db/server";
import { webauthnCredentials } from "@/lib/db/schema/server/webauthn";

// GET — list credentials (id, device_name, created_at; no key_blob)
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authResult = requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const db = getDb();
  const rows = db
    .select({
      id:          webauthnCredentials.id,
      device_name: webauthnCredentials.device_name,
      created_at:  webauthnCredentials.created_at,
    })
    .from(webauthnCredentials)
    .all();

  return NextResponse.json(rows);
}

// PATCH — update device_name for a credential
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const authResult = requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const body = await request.json().catch(() => null);
  if (!body?.id || typeof body.id !== "string" || typeof body.deviceName !== "string") {
    return NextResponse.json({ error: "id and deviceName required" }, { status: 400 });
  }

  const db = getDb();
  db.update(webauthnCredentials)
    .set({ device_name: body.deviceName.slice(0, 64) })
    .where(eq(webauthnCredentials.id, body.id))
    .run();

  return NextResponse.json({ ok: true });
}

// DELETE — revoke a credential by id
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const authResult = requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const body = await request.json().catch(() => null);
  if (!body?.id || typeof body.id !== "string") {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const db = getDb();
  db.delete(webauthnCredentials).where(eq(webauthnCredentials.id, body.id)).run();

  return NextResponse.json({ ok: true });
}
