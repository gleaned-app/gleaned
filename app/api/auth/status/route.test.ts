import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db/server", () => ({ getDb: vi.fn() }));

import { NextRequest } from "next/server";
import { getDb } from "@/lib/db/server";
import { createTestDb } from "../../_test-db";
import { settings } from "@/lib/db/schema/server/settings";
import { sessions } from "@/lib/db/schema/server/sessions";
import { GET } from "./route";

const mockGetDb = vi.mocked(getDb);

beforeEach(() => {
  mockGetDb.mockReturnValue(createTestDb() as ReturnType<typeof getDb>);
});

function req(sid?: string): NextRequest {
  const headers: Record<string, string> = sid ? { Cookie: `sid=${sid}` } : {};
  return new NextRequest("http://localhost/api/auth/status", { headers });
}

function insertSetup() {
  getDb().insert(settings).values({
    id: "gleaned_settings",
    password_verifier: "$argon2id$v=19$fakehash",
    encryption_salt: "testsalt",
    encryption_iterations: 600_000,
  }).run();
}

function insertSession(id: string, expiresAt: string) {
  getDb().insert(sessions).values({
    id,
    created_at: new Date().toISOString(),
    expires_at: expiresAt,
  }).run();
}

describe("GET /api/auth/status", () => {
  it("returns { setup: false, authenticated: false } when DB is empty", async () => {
    const res = GET(req());
    const body = await res.json();
    expect(body.setup).toBe(false);
    expect(body.authenticated).toBe(false);
  });

  it("returns { setup: true, authenticated: false } when set up but no cookie", async () => {
    insertSetup();
    const body = await GET(req()).json();
    expect(body.setup).toBe(true);
    expect(body.authenticated).toBe(false);
  });

  it("returns { setup: true, authenticated: false } when session is expired", async () => {
    insertSetup();
    insertSession("expired_sid", new Date(Date.now() - 1000).toISOString());
    const body = await GET(req("expired_sid")).json();
    expect(body.setup).toBe(true);
    expect(body.authenticated).toBe(false);
  });

  it("returns { setup: true, authenticated: true } with valid session", async () => {
    insertSetup();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    insertSession("valid_sid", future);
    const body = await GET(req("valid_sid")).json();
    expect(body.setup).toBe(true);
    expect(body.authenticated).toBe(true);
  });

  it("returns setup: false when settings row has no password_verifier", async () => {
    // Settings row without verifier (schema allows null)
    getDb().insert(settings).values({
      id: "gleaned_settings",
    }).run();
    const body = await GET(req()).json();
    expect(body.setup).toBe(false);
  });

  it("returns HTTP 200 in all cases", async () => {
    expect(GET(req()).status).toBe(200);
  });
});
