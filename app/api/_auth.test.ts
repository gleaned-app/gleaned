import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db/server", () => ({ getDb: vi.fn() }));

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/server";
import { createTestDb } from "./_test-db";
import { sessions } from "@/lib/db/schema/server/sessions";
import { requireAuth } from "./_auth";

const mockGetDb = vi.mocked(getDb);

beforeEach(() => {
  mockGetDb.mockReturnValue(createTestDb() as ReturnType<typeof getDb>);
});

function req(sid?: string): NextRequest {
  const headers: Record<string, string> = sid ? { Cookie: `sid=${sid}` } : {};
  return new NextRequest("http://localhost/api/test", { headers });
}

function futureExpiry() {
  return new Date(Date.now() + 86_400_000).toISOString();
}

function pastExpiry() {
  return new Date(Date.now() - 1000).toISOString();
}

describe("requireAuth", () => {
  it("returns 401 JSON when no cookie is present", () => {
    const result = requireAuth(req());
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it("returns 401 JSON when session id does not exist in DB", () => {
    const result = requireAuth(req("nonexistent_session"));
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it("returns 401 and deletes the row when session is expired", () => {
    getDb().insert(sessions).values({
      id: "expired_session",
      created_at: "2020-01-01T00:00:00.000Z",
      expires_at: pastExpiry(),
    }).run();

    const result = requireAuth(req("expired_session"));
    expect((result as NextResponse).status).toBe(401);

    // Row should be deleted
    const rows = getDb().select().from(sessions).all();
    expect(rows).toHaveLength(0);
  });

  it("returns { sessionId } for a valid, non-expired session", () => {
    getDb().insert(sessions).values({
      id: "valid_session",
      created_at: new Date().toISOString(),
      expires_at: futureExpiry(),
    }).run();

    const result = requireAuth(req("valid_session"));
    expect(result).toEqual({ sessionId: "valid_session" });
  });

  it("does not delete a valid session when reading it", () => {
    getDb().insert(sessions).values({
      id: "keep_me",
      created_at: new Date().toISOString(),
      expires_at: futureExpiry(),
    }).run();

    requireAuth(req("keep_me"));
    const rows = getDb().select().from(sessions).all();
    expect(rows).toHaveLength(1);
  });
});
