export const runtime = "nodejs";

import { and, eq, gte, lte } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/app/api/_auth";
import { parseDate } from "@/app/api/_params";
import { getDb } from "@/lib/db/server";
import { entries } from "@/lib/db/schema/shared/entries";

function rowToWire(row: typeof entries.$inferSelect) {
  return {
    ...row,
    data_enc: (row.data_enc as Buffer).toString("base64"),
  };
}

export function GET(request: NextRequest): NextResponse {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const date = parseDate(searchParams.get("date"));
  const from = parseDate(searchParams.get("from"));
  const to   = parseDate(searchParams.get("to"));

  const db = getDb();

  if (date) {
    const rows = db.select().from(entries).where(eq(entries.date, date)).all();
    return NextResponse.json(rows.map(rowToWire));
  }

  if (from && to) {
    const rows = db
      .select()
      .from(entries)
      .where(and(gte(entries.date, from), lte(entries.date, to)))
      .all();
    return NextResponse.json(rows.map(rowToWire));
  }

  return NextResponse.json({ error: "Provide ?date=YYYY-MM-DD or ?from=YYYY-MM-DD&to=YYYY-MM-DD" }, { status: 400 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => null);
  if (!body?.id || !body?.date || !body?.created_at || !body?.updated_at || !body?.data_enc) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const row = {
    id: body.id as string,
    date: body.date as string,
    created_at: body.created_at as string,
    updated_at: body.updated_at as string,
    next_review: (body.next_review as string | undefined) ?? null,
    review_interval: (body.review_interval as number | undefined) ?? null,
    data_enc: Buffer.from(body.data_enc as string, "base64"),
  };

  getDb().insert(entries).values(row).run();
  return NextResponse.json(rowToWire({ ...row, data_enc: row.data_enc }), { status: 201 });
}
