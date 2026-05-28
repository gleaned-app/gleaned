export const runtime = "nodejs";

import { asc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/app/api/_auth";
import { getDb } from "@/lib/db/server";
import { threads } from "@/lib/db/schema/shared/threads";

function rowToWire(row: typeof threads.$inferSelect) {
  return {
    ...row,
    data_enc: (row.data_enc as Buffer).toString("base64"),
  };
}

export function GET(request: NextRequest): NextResponse {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const rows = getDb().select().from(threads).orderBy(asc(threads.created_at)).all();
  return NextResponse.json(rows.map(rowToWire));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => null);
  if (!body?.id || !body?.created_at || !body?.updated_at || !body?.data_enc) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const row = {
    id: body.id as string,
    done: (body.done as number | undefined) ?? 0,
    due_date: (body.due_date as string | undefined) ?? null,
    color: (body.color as string | undefined) ?? null,
    created_at: body.created_at as string,
    updated_at: body.updated_at as string,
    data_enc: Buffer.from(body.data_enc as string, "base64"),
  };

  getDb().insert(threads).values(row).run();
  return NextResponse.json(rowToWire({ ...row, data_enc: row.data_enc }), { status: 201 });
}
