import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db/server";
import { login_attempts } from "@/lib/db/schema/server/login_attempts";

// 5 failed attempts within a 15-minute window triggers rate-limit action.
// The window resets after 15 minutes regardless of outcome.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

// When the client IP is unknown (TRUST_PROXY=false, direct-access mode), all
// requests share a single "unknown" bucket. A hard block would let any attacker
// DoS the real user by firing 5 bad requests. Instead we respond with a
// progressive delay: the request is still processed, just slowly. This keeps
// brute-force attempts expensive (≈ 1 attempt / MAX_PENALTY_DELAY_MS) while
// never permanently locking out the legitimate user.
const MAX_PENALTY_DELAY_MS = 30_000;

// Returns the client IP to use as the rate-limit key.
//
// TRUST_PROXY=true  — gleaned is behind a reverse proxy (Traefik, nginx, Caddy)
//                     that injects X-Forwarded-For / X-Real-IP. Trust those
//                     headers so rate limiting targets the real client, not the proxy.
//
// TRUST_PROXY=false — gleaned is exposed directly (pnpm dev, port-only Docker).
//                     Headers are attacker-controlled; use the raw socket IP instead.
//                     X-Forwarded-For is intentionally ignored to prevent bypass.
export function getClientIp(request: NextRequest): string {
  if (process.env.TRUST_PROXY === "true") {
    // Behind a reverse proxy — use the forwarded header it injects.
    // Leftmost IP in the chain is the original client.
    return (
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      request.headers.get("x-real-ip") ??
      "unknown"
    );
  }
  // Direct mode: Next.js App Router (Node.js runtime) does not expose the raw
  // socket IP on NextRequest. All connections therefore share a single rate-limit
  // bucket ("unknown"). This is intentional:
  //
  //   - X-Forwarded-For is completely ignored — an attacker cannot forge a
  //     different IP to escape the bucket and bypass brute-force protection.
  //   - 5 failed attempts from any source trigger a global 15-minute lockout,
  //     which is still meaningful protection for a single-user instance.
  //
  // Set TRUST_PROXY=true if gleaned runs behind a proxy you control — that gives
  // per-IP granularity without the spoofing risk.
  return "unknown";
}

export function checkLoginRateLimit(
  ip: string,
): { limited: boolean; retryAfterMs?: number; penaltyDelayMs?: number } {
  const record = getDb()
    .select()
    .from(login_attempts)
    .where(eq(login_attempts.ip, ip))
    .get();

  if (!record) return { limited: false };

  const windowStart = new Date(record.window_start).getTime();
  if (Date.now() - windowStart >= WINDOW_MS) return { limited: false };

  if (record.attempts >= MAX_ATTEMPTS) {
    const remaining = windowStart + WINDOW_MS - Date.now();
    if (ip === "unknown") {
      // Shared bucket (TRUST_PROXY=false): delay instead of block to avoid DoS.
      return { limited: false, penaltyDelayMs: Math.min(remaining, MAX_PENALTY_DELAY_MS) };
    }
    return { limited: true, retryAfterMs: remaining };
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
