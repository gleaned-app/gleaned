export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/server";
import { settings } from "@/lib/db/schema/server/settings";

export function GET(request: NextRequest): NextResponse {
  const row = getDb().select().from(settings).get();
  const setup = !!(row?.password_verifier && row?.encryption_salt);
  const sid = request.cookies.get("sid")?.value;
  const authenticated = setup && !!sid;

  return NextResponse.json({ setup, authenticated });
}
