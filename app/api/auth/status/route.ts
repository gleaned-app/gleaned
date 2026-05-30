export const runtime = "nodejs";

import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/server";
import { settings } from "@/lib/db/schema/server/settings";
import { sessions } from "@/lib/db/schema/server/sessions";

export function GET(request: NextRequest): NextResponse {
  const db = getDb();
  const row = db.select().from(settings).get();
  const setup = !!(row?.password_verifier && row?.encryption_salt);

  let authenticated = false;
  if (setup) {
    const sid = request.cookies.get("sid")?.value;
    if (sid) {
      const session = db
        .select({ expires_at: sessions.expires_at })
        .from(sessions)
        .where(eq(sessions.id, sid))
        .get();
      authenticated = !!session && new Date(session.expires_at) > new Date();
    }
  }

  return NextResponse.json({ setup, authenticated });
}
