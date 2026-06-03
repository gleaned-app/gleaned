import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/db/server",            () => ({ getDb: vi.fn() }));
vi.mock("argon2",                     () => ({ verify: vi.fn(), hash: vi.fn(), argon2id: 2 }));
vi.mock("@/lib/setup-token.server",   () => ({ getSetupToken: vi.fn(), consumeSetupToken: vi.fn() }));

import { NextRequest } from "next/server";
import * as argon2 from "argon2";
import { getDb } from "@/lib/db/server";
import { getSetupToken, consumeSetupToken } from "@/lib/setup-token.server";
import { createTestDb } from "../../_test-db";
import { settings } from "@/lib/db/schema/server/settings";
import { sessions } from "@/lib/db/schema/server/sessions";
import { POST } from "./route";

const mockGetDb        = vi.mocked(getDb);
const mockHash         = vi.mocked(argon2.hash);
const mockGetToken     = vi.mocked(getSetupToken);
const mockConsumeToken = vi.mocked(consumeSetupToken);

const VALID_TOKEN = "setup_token_1234567890abcdef";

function setupReq(body: Record<string, unknown>, extraHeaders?: Record<string, string>) {
  return new NextRequest("http://localhost/api/auth/setup", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDb.mockReturnValue(createTestDb() as ReturnType<typeof getDb>);
  mockHash.mockResolvedValue("$argon2id$v=19$hashed_password" as never);
  mockGetToken.mockReturnValue(VALID_TOKEN);
  mockConsumeToken.mockImplementation(() => {});
});

const VALID_BODY = {
  password: "SecurePass123",
  encryptionSalt: "base64encryptionsalt",
  setupToken: VALID_TOKEN,
};

// ─── Input validation ──────────────────────────────────────────────────────────

describe("POST /api/auth/setup — input validation", () => {
  it("returns 400 when body exceeds the 4 KB limit", async () => {
    const req = new NextRequest("http://localhost/api/auth/setup", {
      method: "POST",
      body: "x".repeat(5 * 1024),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is missing", async () => {
    const res = await POST(setupReq({ encryptionSalt: "s", setupToken: VALID_TOKEN }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when encryptionSalt is missing", async () => {
    const res = await POST(setupReq({ password: "pw", setupToken: VALID_TOKEN }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when setupToken is missing", async () => {
    const res = await POST(setupReq({ password: "pw", encryptionSalt: "s" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is not valid JSON", async () => {
    const req = new NextRequest("http://localhost/api/auth/setup", {
      method: "POST",
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

// ─── Already set up ────────────────────────────────────────────────────────────

describe("POST /api/auth/setup — already set up", () => {
  it("returns 409 when a password_verifier already exists", async () => {
    getDb().insert(settings).values({
      id: "gleaned_settings",
      password_verifier: "$argon2id$existing",
    }).run();
    const res = await POST(setupReq(VALID_BODY));
    expect(res.status).toBe(409);
  });
});

// ─── Wrong setup token ─────────────────────────────────────────────────────────

describe("POST /api/auth/setup — wrong token", () => {
  it("returns 403 when setup token does not match", async () => {
    const res = await POST(setupReq({ ...VALID_BODY, setupToken: "wrong_token" }));
    expect(res.status).toBe(403);
  });

  it("returns 403 when setup token is null (not initialized)", async () => {
    mockGetToken.mockReturnValue(null);
    const res = await POST(setupReq(VALID_BODY));
    expect(res.status).toBe(403);
  });
});

// ─── Successful setup ──────────────────────────────────────────────────────────

describe("POST /api/auth/setup — success", () => {
  it("returns 200 with { ok: true }", async () => {
    const res = await POST(setupReq(VALID_BODY));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("stores the password verifier in the DB", async () => {
    await POST(setupReq(VALID_BODY));
    const row = getDb().select().from(settings).get();
    expect(row?.password_verifier).toBe("$argon2id$v=19$hashed_password");
  });

  it("stores the encryption salt in the DB", async () => {
    await POST(setupReq(VALID_BODY));
    const row = getDb().select().from(settings).get();
    expect(row?.encryption_salt).toBe("base64encryptionsalt");
  });

  it("creates a session row", async () => {
    await POST(setupReq(VALID_BODY));
    const rows = getDb().select().from(sessions).all();
    expect(rows).toHaveLength(1);
  });

  it("sets an httpOnly sid cookie", async () => {
    const res = await POST(setupReq(VALID_BODY));
    const cookie = res.headers.get("Set-Cookie") ?? "";
    expect(cookie).toMatch(/sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it("consumes the setup token so it cannot be reused", async () => {
    await POST(setupReq(VALID_BODY));
    expect(mockConsumeToken).toHaveBeenCalledOnce();
  });

  it("rejects a second setup attempt after first succeeded (409)", async () => {
    await POST(setupReq(VALID_BODY));
    // Simulate token being consumed: next call returns null
    mockGetToken.mockReturnValue(null);
    const res = await POST(setupReq(VALID_BODY));
    // Already set up → 409 (checked before token validation)
    expect(res.status).toBe(409);
  });
});

// ─── Rate limiting ─────────────────────────────────────────────────────────────

// Run with TRUST_PROXY=true + fixed IP to hit the per-IP hard-block (429) path.
// Without TRUST_PROXY the bucket is "unknown" and the route uses progressive
// delay instead, which avoids DoS lockout of the real user.
describe("POST /api/auth/setup — rate limiting", () => {
  const IP_HEADERS = { "x-forwarded-for": "203.0.113.42" };

  beforeEach(() => {
    vi.stubEnv("TRUST_PROXY", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 429 after 5 failed token attempts", async () => {
    mockGetToken.mockReturnValue("correct_token");
    for (let i = 0; i < 5; i++) {
      await POST(setupReq({ ...VALID_BODY, setupToken: "wrong_token" }, IP_HEADERS));
    }
    const res = await POST(setupReq({ ...VALID_BODY, setupToken: "wrong_token" }, IP_HEADERS));
    expect(res.status).toBe(429);
  });
});
