import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/db/server", () => ({ getDb: vi.fn() }));
vi.mock("argon2", () => ({ verify: vi.fn(), hash: vi.fn(), argon2id: 2 }));

import { NextRequest } from "next/server";
import * as argon2 from "argon2";
import { getDb } from "@/lib/db/server";
import { createTestDb } from "../../_test-db";
import { settings } from "@/lib/db/schema/server/settings";
import { sessions } from "@/lib/db/schema/server/sessions";
import { POST } from "./route";

const mockGetDb = vi.mocked(getDb);
const mockVerify = vi.mocked(argon2.verify);

function loginReq(body: Record<string, unknown>, extraHeaders?: Record<string, string>) {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

function insertSettings() {
  getDb().insert(settings).values({
    id: "gleaned_settings",
    password_verifier: "$argon2id$v=19$fakeverifier",
    encryption_salt: "test_enc_salt_base64",
    encryption_iterations: 600_000,
  }).run();
}

beforeEach(() => {
  mockGetDb.mockReturnValue(createTestDb() as ReturnType<typeof getDb>);
  mockVerify.mockResolvedValue(false);
});

// ─── Input validation ──────────────────────────────────────────────────────────

describe("POST /api/auth/login — input validation", () => {
  it("returns 400 when password field is missing", async () => {
    const res = await POST(loginReq({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is not valid JSON", async () => {
    const req = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is an empty string (falsy)", async () => {
    const res = await POST(loginReq({ password: "" }));
    expect(res.status).toBe(400);
  });
});

// ─── Not set up ────────────────────────────────────────────────────────────────

describe("POST /api/auth/login — not set up", () => {
  it("returns 404 when no settings row exists", async () => {
    const res = await POST(loginReq({ password: "any" }));
    expect(res.status).toBe(404);
  });

  it("returns 404 when settings row has no password_verifier", async () => {
    getDb().insert(settings).values({ id: "gleaned_settings" }).run();
    const res = await POST(loginReq({ password: "any" }));
    expect(res.status).toBe(404);
  });
});

// ─── Wrong password ────────────────────────────────────────────────────────────

describe("POST /api/auth/login — wrong password", () => {
  beforeEach(insertSettings);

  it("returns 401 when argon2.verify returns false", async () => {
    mockVerify.mockResolvedValue(false);
    const res = await POST(loginReq({ password: "wrong" }));
    expect(res.status).toBe(401);
  });

  it("response body contains an error field", async () => {
    mockVerify.mockResolvedValue(false);
    const body = await (await POST(loginReq({ password: "wrong" }))).json();
    expect(body.error).toBeTruthy();
  });
});

// ─── Correct password ──────────────────────────────────────────────────────────

describe("POST /api/auth/login — correct password", () => {
  beforeEach(() => {
    insertSettings();
    mockVerify.mockResolvedValue(true);
  });

  it("returns 200 with ok: true", async () => {
    const res = await POST(loginReq({ password: "correct" }));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("includes encryptionSalt in response", async () => {
    const body = await (await POST(loginReq({ password: "correct" }))).json();
    expect(body.encryptionSalt).toBe("test_enc_salt_base64");
  });

  it("includes encryptionIterations in response", async () => {
    const body = await (await POST(loginReq({ password: "correct" }))).json();
    expect(body.encryptionIterations).toBe(600_000);
  });

  it("does not expose password_verifier in response", async () => {
    const body = await (await POST(loginReq({ password: "correct" }))).json();
    expect(body.password_verifier).toBeUndefined();
  });

  it("creates a session row in the DB", async () => {
    await POST(loginReq({ password: "correct" }));
    const rows = getDb().select().from(sessions).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toHaveLength(64); // randomBytes(32).toString("hex")
  });

  it("sets an httpOnly sid cookie", async () => {
    const res = await POST(loginReq({ password: "correct" }));
    const cookie = res.headers.get("Set-Cookie") ?? "";
    expect(cookie).toMatch(/sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it("sets SameSite=Strict on the cookie", async () => {
    const res = await POST(loginReq({ password: "correct" }));
    expect(res.headers.get("Set-Cookie")).toMatch(/SameSite=Strict/i);
  });
});

// ─── Brute-force protection ────────────────────────────────────────────────────

// Rate-limit tests run with TRUST_PROXY=true + a fixed client IP so the route
// uses the per-IP hard-block path (429). Without TRUST_PROXY the IP is "unknown"
// and the route uses the progressive-delay path instead to avoid DoS lockout.
describe("POST /api/auth/login — rate limiting", () => {
  const IP_HEADERS = { "x-forwarded-for": "203.0.113.42" };

  beforeEach(() => {
    insertSettings();
    mockVerify.mockResolvedValue(false);
    vi.stubEnv("TRUST_PROXY", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 429 after 5 consecutive failed attempts", async () => {
    for (let i = 0; i < 5; i++) {
      await POST(loginReq({ password: "wrong" }, IP_HEADERS));
    }
    const res = await POST(loginReq({ password: "wrong" }, IP_HEADERS));
    expect(res.status).toBe(429);
  });

  it("includes Retry-After header on 429 response", async () => {
    for (let i = 0; i < 5; i++) await POST(loginReq({ password: "wrong" }, IP_HEADERS));
    const res = await POST(loginReq({ password: "wrong" }, IP_HEADERS));
    const retryAfter = res.headers.get("Retry-After");
    expect(retryAfter).toBeTruthy();
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });

  it("allows login again after successful login clears the rate limit", async () => {
    // 1 failed attempt
    await POST(loginReq({ password: "wrong" }, IP_HEADERS));
    // Successful login clears the bucket
    mockVerify.mockResolvedValueOnce(true);
    await POST(loginReq({ password: "correct" }, IP_HEADERS));
    // Should now be allowed (fresh bucket)
    mockVerify.mockResolvedValue(false);
    const res = await POST(loginReq({ password: "wrong" }, IP_HEADERS));
    expect(res.status).toBe(401); // 401, not 429
  });
});
