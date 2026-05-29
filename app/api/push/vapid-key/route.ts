export const runtime = "nodejs";

import { NextResponse } from "next/server";

export function GET(): NextResponse {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) return NextResponse.json({ available: false });
  return NextResponse.json({ publicKey });
}
