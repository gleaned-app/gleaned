export const runtime = "nodejs";

import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/server";
import { sessions } from "@/lib/db/schema/server/sessions";

export function requireAuth(
  request: NextRequest,
): { sessionId: string } | NextResponse {
  const sid = request.cookies.get("sid")?.value;
  if (!sid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const session = db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sid))
    .get();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (new Date(session.expires_at) < new Date()) {
    db.delete(sessions).where(eq(sessions.id, sid)).run();
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  return { sessionId: sid };
}
