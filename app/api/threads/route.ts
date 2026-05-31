export const runtime = "nodejs";

import { asc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/app/api/_auth";
import { readJsonWithLimit } from "@/app/api/_body";
import { getDb } from "@/lib/db/server";
import { threads } from "@/lib/db/schema/shared/threads";
import { isValidThread } from "@/lib/import-validate";

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

  const body = await readJsonWithLimit(request);
  if (body === undefined) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  if (!isValidThread(body)) return NextResponse.json({ error: "Invalid thread" }, { status: 422 });

  const row = {
    id:         body.id as string,
    done:       (body.done as number | undefined) ?? 0,
    due_date:   (body.due_date as string | undefined) ?? null,
    color:      (body.color as string | undefined) ?? null,
    created_at: body.created_at as string,
    updated_at: body.updated_at as string,
    data_enc:   Buffer.from(body.data_enc as string, "base64"),
  };

  getDb().insert(threads).values(row).run();
  return NextResponse.json(rowToWire({ ...row, data_enc: row.data_enc }), { status: 201 });
}
