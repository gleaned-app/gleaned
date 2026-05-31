export const runtime = "nodejs";

import { and, isNotNull, lte } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/app/api/_auth";
import { parseDate } from "@/app/api/_params";
import { getDb } from "@/lib/db/server";
import { entries } from "@/lib/db/schema/shared/entries";

export function GET(request: NextRequest): NextResponse {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const date = parseDate(searchParams.get("date")) ?? new Date().toISOString().slice(0, 10);

  const rows = getDb()
    .select()
    .from(entries)
    .where(and(isNotNull(entries.next_review), lte(entries.next_review, date)))
    .all();

  return NextResponse.json(
    rows.map((row) => ({
      ...row,
      data_enc: (row.data_enc as Buffer).toString("base64"),
    })),
  );
}
