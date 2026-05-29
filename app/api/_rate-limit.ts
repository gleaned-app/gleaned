import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db/server";
import { login_attempts } from "@/lib/db/schema/server/login_attempts";

// 5 failed attempts within a 15-minute window triggers a 15-minute lockout.
// The window resets after 15 minutes regardless of outcome.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export function checkLoginRateLimit(ip: string): { limited: boolean; retryAfterMs?: number } {
  const record = getDb()
    .select()
    .from(login_attempts)
    .where(eq(login_attempts.ip, ip))
    .get();

  if (!record) return { limited: false };

  const windowStart = new Date(record.window_start).getTime();
  if (Date.now() - windowStart >= WINDOW_MS) return { limited: false };

  if (record.attempts >= MAX_ATTEMPTS) {
    return { limited: true, retryAfterMs: windowStart + WINDOW_MS - Date.now() };
  }

  return { limited: false };
}

export function recordLoginFailure(ip: string): void {
  const db = getDb();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const record = db.select().from(login_attempts).where(eq(login_attempts.ip, ip)).get();

  if (record) {
    const windowStart = new Date(record.window_start).getTime();
    if (now - windowStart >= WINDOW_MS) {
      db.update(login_attempts)
        .set({ attempts: 1, window_start: nowIso })
        .where(eq(login_attempts.ip, ip))
        .run();
    } else {
      db.update(login_attempts)
        .set({ attempts: record.attempts + 1 })
        .where(eq(login_attempts.ip, ip))
        .run();
    }
  } else {
    db.insert(login_attempts)
      .values({ ip, attempts: 1, window_start: nowIso })
      .run();
  }
}

export function clearLoginAttempts(ip: string): void {
  getDb().delete(login_attempts).where(eq(login_attempts.ip, ip)).run();
}
