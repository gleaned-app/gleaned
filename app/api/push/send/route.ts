export const runtime = "nodejs";

import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { broadcast } from "@/lib/push/send";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.SEND_SECRET ?? "";
  if (!secret) return NextResponse.json({ error: "SEND_SECRET not configured" }, { status: 503 });

  const provided = String(request.headers.get("x-send-secret") ?? "");
  const authorized =
    provided.length === secret.length &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(secret));

  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const override = await request.json().catch(() => ({})) as Record<string, string>;
  const result   = await broadcast((lang) => ({
    title: lang === "en" ? "gleaned" : "gleaned",
    body:  lang === "en" ? "What did you learn today?" : "Was hast du heute gelernt?",
    url:   "/",
    ...override,
  }));

  return NextResponse.json(result);
}
