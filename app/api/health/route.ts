export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/server";

export function GET(): NextResponse {
  // Confirm the DB is reachable — healthcheck fails if SQLite can't be opened.
  getDb();
  return NextResponse.json({ ok: true });
}
