import { describe, it, expect, afterEach, vi } from "vitest";

// getDb is lazy — mock it so tests never touch the filesystem.
vi.mock("@/lib/db/server", () => ({ getDb: vi.fn() }));

import { getClientIp } from "./_rate-limit";
import type { NextRequest } from "next/server";

afterEach(() => {
  vi.unstubAllEnvs();
});

function req(opts: { forwardedFor?: string; realIp?: string } = {}): NextRequest {
  return {
    headers: {
      get: (h: string) =>
        h === "x-forwarded-for" ? (opts.forwardedFor ?? null) :
        h === "x-real-ip"       ? (opts.realIp ?? null) : null,
    },
  } as unknown as NextRequest;
}

// ─── TRUST_PROXY not set / false (direct mode) ────────────────────────────────
//
// In direct mode, Next.js App Router (Node.js runtime) does not expose the raw
// socket IP. All requests share a single "unknown" bucket. The important property
// is that X-Forwarded-For is completely ignored — an attacker cannot send a
// different IP value on each request to escape the bucket and bypass rate limiting.

describe("getClientIp — TRUST_PROXY not set (direct mode)", () => {
  it("returns 'unknown' regardless of headers", () => {
    expect(getClientIp(req({ forwardedFor: "1.2.3.4", realIp: "5.6.7.8" }))).toBe("unknown");
  });

  it("returns 'unknown' when no headers are present", () => {
    expect(getClientIp(req())).toBe("unknown");
  });
});

describe("getClientIp — TRUST_PROXY=false (explicit direct mode)", () => {
  it("returns 'unknown' regardless of X-Forwarded-For", () => {
    vi.stubEnv("TRUST_PROXY", "false");
    expect(getClientIp(req({ forwardedFor: "8.8.8.8" }))).toBe("unknown");
  });

  it("returns 'unknown' regardless of X-Real-IP", () => {
    vi.stubEnv("TRUST_PROXY", "false");
    expect(getClientIp(req({ realIp: "9.9.9.9" }))).toBe("unknown");
  });
});

// ─── TRUST_PROXY=true (behind reverse proxy) ─────────────────────────────────

describe("getClientIp — TRUST_PROXY=true (behind proxy)", () => {
  it("uses the leftmost IP from X-Forwarded-For (real client)", () => {
    vi.stubEnv("TRUST_PROXY", "true");
    const r = req({ forwardedFor: "203.0.113.1, 10.0.0.1, 172.16.0.1" });
    expect(getClientIp(r)).toBe("203.0.113.1");
  });

  it("trims whitespace from X-Forwarded-For entries", () => {
    vi.stubEnv("TRUST_PROXY", "true");
    const r = req({ forwardedFor: "  203.0.113.2  , 10.0.0.1" });
    expect(getClientIp(r)).toBe("203.0.113.2");
  });

  it("falls back to X-Real-IP when X-Forwarded-For is absent", () => {
    vi.stubEnv("TRUST_PROXY", "true");
    expect(getClientIp(req({ realIp: "203.0.113.3" }))).toBe("203.0.113.3");
  });

  it("returns 'unknown' when no proxy headers are present", () => {
    vi.stubEnv("TRUST_PROXY", "true");
    expect(getClientIp(req())).toBe("unknown");
  });

  it("single-IP X-Forwarded-For works correctly", () => {
    vi.stubEnv("TRUST_PROXY", "true");
    expect(getClientIp(req({ forwardedFor: "203.0.113.42" }))).toBe("203.0.113.42");
  });
});

// ─── Security: X-Forwarded-For spoofing is impossible without TRUST_PROXY=true ─

describe("getClientIp — spoofing guard", () => {
  it("X-Forwarded-For cannot escape the rate-limit bucket when TRUST_PROXY is false", () => {
    vi.stubEnv("TRUST_PROXY", "false");
    // Attacker cycles through forged IPs on every request
    const attempt1 = getClientIp(req({ forwardedFor: "0.0.0.0" }));
    const attempt2 = getClientIp(req({ forwardedFor: "1.1.1.1" }));
    const attempt3 = getClientIp(req({ forwardedFor: "2.2.2.2" }));
    // All attempts land in the same bucket — the forged IPs are ignored
    expect(attempt1).toBe("unknown");
    expect(attempt2).toBe("unknown");
    expect(attempt3).toBe("unknown");
  });

  it("X-Real-IP cannot escape the rate-limit bucket when TRUST_PROXY is false", () => {
    vi.stubEnv("TRUST_PROXY", "false");
    const attempt1 = getClientIp(req({ realIp: "10.0.0.1" }));
    const attempt2 = getClientIp(req({ realIp: "10.0.0.2" }));
    expect(attempt1).toBe("unknown");
    expect(attempt2).toBe("unknown");
  });
});
