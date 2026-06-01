export const runtime = "nodejs";

import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/app/api/_auth";
import { readJsonWithLimit } from "@/app/api/_body";
import { getDb } from "@/lib/db/server";
import { entries } from "@/lib/db/schema/shared/entries";
import { isValidId, isValidEntryUpdate } from "@/lib/import-validate";

type RouteParams = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!isValidId(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await readJsonWithLimit(request);
  if (body === undefined) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  if (!isValidEntryUpdate(body)) return NextResponse.json({ error: "Invalid entry" }, { status: 422 });

  const db = getDb();

  // Optional optimistic locking: If-Match must equal current updated_at.
  const ifMatch = request.headers.get("If-Match")?.replace(/^"|"$/g, "");
  if (ifMatch) {
    const current = db.select({ updated_at: entries.updated_at }).from(entries).where(eq(entries.id, id)).get();
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (current.updated_at !== ifMatch) {
      return NextResponse.json({ error: "Precondition failed" }, { status: 412 });
    }
  }

  const row = {
    id,
    date:            body.date as string,
    created_at:      body.created_at as string,
    updated_at:      body.updated_at as string,
    next_review:     (body.next_review as string | undefined) ?? null,
    review_interval: (body.review_interval as number | undefined) ?? null,
    data_enc:        Buffer.from(body.data_enc as string, "base64"),
  };

  db.insert(entries)
    .values(row)
    .onConflictDoUpdate({ target: entries.id, set: row })
    .run();

  const response = NextResponse.json({
    ...row,
    data_enc: body.data_enc as string,
  });
  response.headers.set("ETag", `"${row.updated_at}"`);
  return response;
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!isValidId(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  getDb().delete(entries).where(eq(entries.id, id)).run();
  return new NextResponse(null, { status: 204 });
}
