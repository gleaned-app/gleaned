export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/app/api/_auth";
import { getDb } from "@/lib/db/server";
import { entries } from "@/lib/db/schema/shared/entries";
import { threads } from "@/lib/db/schema/shared/threads";

export function GET(request: NextRequest): NextResponse {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const db = getDb();

  const allEntries = db
    .select()
    .from(entries)
    .all()
    .map((row) => ({ ...row, data_enc: (row.data_enc as Buffer).toString("base64") }));

  const allThreads = db
    .select()
    .from(threads)
    .all()
    .map((row) => ({ ...row, data_enc: (row.data_enc as Buffer).toString("base64") }));

  return NextResponse.json({
    version: 1,
    exported_at: new Date().toISOString(),
    entries: allEntries,
    threads: allThreads,
  });
}
