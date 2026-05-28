export const runtime = "nodejs";

import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/app/api/_auth";
import { getDb } from "@/lib/db/server";
import { threads } from "@/lib/db/schema/shared/threads";

type RouteParams = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body?.updated_at || !body?.data_enc) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const row = {
    id,
    done: (body.done as number | undefined) ?? 0,
    due_date: (body.due_date as string | undefined) ?? null,
    color: (body.color as string | undefined) ?? null,
    created_at: body.created_at as string,
    updated_at: body.updated_at as string,
    data_enc: Buffer.from(body.data_enc as string, "base64"),
  };

  getDb()
    .insert(threads)
    .values(row)
    .onConflictDoUpdate({ target: threads.id, set: row })
    .run();

  return NextResponse.json({ ...row, data_enc: body.data_enc as string });
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  getDb().delete(threads).where(eq(threads.id, id)).run();
  return new NextResponse(null, { status: 204 });
}
