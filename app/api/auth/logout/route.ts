export const runtime = "nodejs";

import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/server";
import { sessions } from "@/lib/db/schema/server/sessions";
import { secureCookie } from "@/app/api/_cookie";

export function POST(request: NextRequest): NextResponse {
  const sid = request.cookies.get("sid")?.value;
  if (sid) {
    getDb().delete(sessions).where(eq(sessions.id, sid)).run();
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("sid", "", {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
