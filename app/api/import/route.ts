export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/app/api/_auth";
import { readJsonWithLimit } from "@/app/api/_body";
import { getDb } from "@/lib/db/server";
import { entries } from "@/lib/db/schema/shared/entries";
import { threads } from "@/lib/db/schema/shared/threads";

function isValidEntry(e: unknown): e is Record<string, unknown> {
  if (!e || typeof e !== "object") return false;
  const r = e as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.date === "string" &&
    typeof r.created_at === "string" &&
    typeof r.updated_at === "string" &&
    typeof r.data_enc === "string"
  );
}

function isValidThread(t: unknown): t is Record<string, unknown> {
  if (!t || typeof t !== "object") return false;
  const r = t as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.created_at === "string" &&
    typeof r.updated_at === "string" &&
    typeof r.data_enc === "string"
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await readJsonWithLimit(request);
  if (body === undefined) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const rawEntries: unknown[] = Array.isArray(b.entries) ? b.entries : [];
  const rawThreads: unknown[] = Array.isArray(b.threads) ? b.threads : [];

  const validEntries = rawEntries.filter(isValidEntry);
  const validThreads = rawThreads.filter(isValidThread);

  const db = getDb();

  for (const e of validEntries) {
    const row = {
      id: e.id as string,
      date: e.date as string,
      created_at: e.created_at as string,
      updated_at: e.updated_at as string,
      next_review: (e.next_review as string | undefined) ?? null,
      review_interval: (e.review_interval as number | undefined) ?? null,
      data_enc: Buffer.from(e.data_enc as string, "base64"),
    };
    db.insert(entries).values(row).onConflictDoUpdate({ target: entries.id, set: row }).run();
  }

  for (const t of validThreads) {
    const row = {
      id: t.id as string,
      done: (t.done as number | undefined) ?? 0,
      due_date: (t.due_date as string | undefined) ?? null,
      color: (t.color as string | undefined) ?? null,
      created_at: t.created_at as string,
      updated_at: t.updated_at as string,
      data_enc: Buffer.from(t.data_enc as string, "base64"),
    };
    db.insert(threads).values(row).onConflictDoUpdate({ target: threads.id, set: row }).run();
  }

  return NextResponse.json({
    imported: { entries: validEntries.length, threads: validThreads.length },
    skipped: { entries: rawEntries.length - validEntries.length, threads: rawThreads.length - validThreads.length },
  });
}
