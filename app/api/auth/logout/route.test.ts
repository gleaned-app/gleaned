import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db/server", () => ({ getDb: vi.fn() }));

import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/server";
import { createTestDb } from "../../_test-db";
import { sessions } from "@/lib/db/schema/server/sessions";
import { POST } from "./route";

const mockGetDb = vi.mocked(getDb);

beforeEach(() => {
  mockGetDb.mockReturnValue(createTestDb() as ReturnType<typeof getDb>);
});

const SESSION = "logout_test_session";

function insertSession() {
  getDb().insert(sessions).values({
    id: SESSION,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  }).run();
}

describe("POST /api/auth/logout", () => {
  it("returns 200 with { ok: true }", async () => {
    const req = new NextRequest("http://localhost/api/auth/logout", { method: "POST" });
    const res = POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("deletes the session row when a valid sid cookie is present", () => {
    insertSession();
    const req = new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { Cookie: `sid=${SESSION}` },
    });
    POST(req);
    const row = getDb().select().from(sessions).where(eq(sessions.id, SESSION)).get();
    expect(row).toBeUndefined();
  });

  it("does not throw when no cookie is present (no-op logout)", () => {
    const req = new NextRequest("http://localhost/api/auth/logout", { method: "POST" });
    expect(() => POST(req)).not.toThrow();
  });

  it("does not throw when the session id does not exist in the DB", () => {
    const req = new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { Cookie: "sid=nonexistent_session_id" },
    });
    expect(() => POST(req)).not.toThrow();
  });

  it("clears the sid cookie (maxAge 0) in the response", () => {
    const req = new NextRequest("http://localhost/api/auth/logout", { method: "POST" });
    const res = POST(req);
    const setCookie = res.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toContain("sid=");
    expect(setCookie).toMatch(/max-age=0/i);
  });

  it("sets HttpOnly on the cleared cookie", () => {
    const req = new NextRequest("http://localhost/api/auth/logout", { method: "POST" });
    const res = POST(req);
    expect(res.headers.get("Set-Cookie")).toMatch(/HttpOnly/i);
  });
});
