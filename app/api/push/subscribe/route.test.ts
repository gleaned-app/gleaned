import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db/server", () => ({ getDb: vi.fn() }));

import { NextRequest } from "next/server";
import { getDb } from "@/lib/db/server";
import { createTestDb } from "../../_test-db";
import { sessions } from "@/lib/db/schema/server/sessions";
import { POST, DELETE } from "./route";

const mockGetDb = vi.mocked(getDb);
const SESSION = "push_subscribe_test_session";

// A realistic push subscription body — keys match actual browser-produced sizes:
// p256dh: base64url of 65-byte uncompressed EC public key (87 chars)
// auth:   base64url of 16-byte random (22 chars)
const VALID_ENDPOINT = "https://fcm.googleapis.com/fcm/send/test-endpoint-abc123";
const VALID_P256DH   = "BNcRdreALRFXTkOOUHK1EtK2wtZ5BKQR_5B3tXFtXFtXFtXFtXFtXFtXFtXFtXFtXFtXFtXFtXF";
const VALID_AUTH     = "tBHItJI5svbpez7K";

function authedPost(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", Cookie: `sid=${SESSION}` },
  });
}

function authedDelete(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/push/subscribe", {
    method: "DELETE",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", Cookie: `sid=${SESSION}` },
  });
}

beforeEach(() => {
  mockGetDb.mockReturnValue(createTestDb() as ReturnType<typeof getDb>);
  getDb().insert(sessions).values({
    id: SESSION,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  }).run();
});

// ─── Authentication ────────────────────────────────────────────────────────────

describe("POST /api/push/subscribe — auth", () => {
  it("returns 401 without a session cookie", async () => {
    const req = new NextRequest("http://localhost/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify({ endpoint: VALID_ENDPOINT, keys: { p256dh: VALID_P256DH, auth: VALID_AUTH } }),
    });
    expect((await POST(req)).status).toBe(401);
  });
});

// ─── Body size ─────────────────────────────────────────────────────────────────

describe("POST /api/push/subscribe — body size", () => {
  it("returns 400 when body exceeds the 4 KB limit", async () => {
    const req = new NextRequest("http://localhost/api/push/subscribe", {
      method: "POST",
      body: "x".repeat(5 * 1024),
      headers: { Cookie: `sid=${SESSION}` },
    });
    expect((await POST(req)).status).toBe(400);
  });
});

// ─── Required fields ───────────────────────────────────────────────────────────

describe("POST /api/push/subscribe — required fields", () => {
  it("returns 400 when endpoint is missing", async () => {
    const res = await POST(authedPost({ keys: { p256dh: VALID_P256DH, auth: VALID_AUTH } }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when keys.p256dh is missing", async () => {
    const res = await POST(authedPost({ endpoint: VALID_ENDPOINT, keys: { auth: VALID_AUTH } }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when keys.auth is missing", async () => {
    const res = await POST(authedPost({ endpoint: VALID_ENDPOINT, keys: { p256dh: VALID_P256DH } }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when keys is not an object", async () => {
    const res = await POST(authedPost({ endpoint: VALID_ENDPOINT, keys: "not-an-object" }));
    expect(res.status).toBe(400);
  });
});

// ─── Field length limits ───────────────────────────────────────────────────────

describe("POST /api/push/subscribe — field length limits", () => {
  it("returns 400 when endpoint exceeds 2048 chars", async () => {
    const res = await POST(authedPost({
      endpoint: "https://example.com/" + "a".repeat(2040),
      keys: { p256dh: VALID_P256DH, auth: VALID_AUTH },
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when p256dh exceeds 256 chars", async () => {
    const res = await POST(authedPost({
      endpoint: VALID_ENDPOINT,
      keys: { p256dh: "a".repeat(257), auth: VALID_AUTH },
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when auth_key exceeds 64 chars", async () => {
    const res = await POST(authedPost({
      endpoint: VALID_ENDPOINT,
      keys: { p256dh: VALID_P256DH, auth: "a".repeat(65) },
    }));
    expect(res.status).toBe(400);
  });

  it("accepts values exactly at the field length limits", async () => {
    const res = await POST(authedPost({
      endpoint: "https://example.com/" + "a".repeat(2028), // exactly 2048 chars
      keys: { p256dh: "a".repeat(256), auth: "a".repeat(64) },
    }));
    expect(res.status).toBe(200);
  });
});

// ─── Successful subscription ───────────────────────────────────────────────────

describe("POST /api/push/subscribe — success", () => {
  it("returns 200 with ok: true", async () => {
    const res = await POST(authedPost({
      endpoint: VALID_ENDPOINT,
      keys: { p256dh: VALID_P256DH, auth: VALID_AUTH },
    }));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("accepts optional lang=en field", async () => {
    const res = await POST(authedPost({
      endpoint: VALID_ENDPOINT,
      keys: { p256dh: VALID_P256DH, auth: VALID_AUTH },
      lang: "en",
    }));
    expect(res.status).toBe(200);
  });

  it("accepts optional tz field with a valid timezone", async () => {
    const res = await POST(authedPost({
      endpoint: VALID_ENDPOINT,
      keys: { p256dh: VALID_P256DH, auth: VALID_AUTH },
      tz: "Europe/Berlin",
    }));
    expect(res.status).toBe(200);
  });

  it("falls back to UTC for an invalid tz", async () => {
    const res = await POST(authedPost({
      endpoint: VALID_ENDPOINT,
      keys: { p256dh: VALID_P256DH, auth: VALID_AUTH },
      tz: "Not/ATimezone",
    }));
    expect(res.status).toBe(200);
  });
});

// ─── DELETE ───────────────────────────────────────────────────────────────────

describe("DELETE /api/push/subscribe", () => {
  it("returns 401 without a session cookie", async () => {
    const req = new NextRequest("http://localhost/api/push/subscribe", {
      method: "DELETE",
      body: JSON.stringify({ endpoint: VALID_ENDPOINT }),
    });
    expect((await DELETE(req)).status).toBe(401);
  });

  it("returns 400 when endpoint is missing", async () => {
    const res = await DELETE(authedDelete({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when body exceeds the 4 KB limit", async () => {
    const req = new NextRequest("http://localhost/api/push/subscribe", {
      method: "DELETE",
      body: "x".repeat(5 * 1024),
      headers: { Cookie: `sid=${SESSION}` },
    });
    expect((await DELETE(req)).status).toBe(400);
  });

  it("returns 200 for a valid delete (endpoint need not exist)", async () => {
    const res = await DELETE(authedDelete({ endpoint: VALID_ENDPOINT }));
    expect(res.status).toBe(200);
  });
});
