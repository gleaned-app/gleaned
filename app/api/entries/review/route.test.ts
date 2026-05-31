import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db/server", () => ({ getDb: vi.fn() }));

import { NextRequest } from "next/server";
import { getDb } from "@/lib/db/server";
import { createTestDb } from "../../_test-db";
import { sessions } from "@/lib/db/schema/server/sessions";
import { entries } from "@/lib/db/schema/shared/entries";
import { GET } from "./route";

const mockGetDb = vi.mocked(getDb);
const SESSION   = "review_test_session";
const ENC       = Buffer.from(new Uint8Array(32)).toString("base64");

function authed(url: string): NextRequest {
  return new NextRequest(url, { headers: { Cookie: `sid=${SESSION}` } });
}

function insertEntry(id: string, nextReview: string | null) {
  getDb().insert(entries).values({
    id, date: "2026-01-10",
    created_at: "2026-01-10T00:00:00.000Z", updated_at: "2026-01-10T00:00:00.000Z",
    next_review: nextReview,
    data_enc: Buffer.from(ENC, "base64"),
  }).run();
}

beforeEach(() => {
  mockGetDb.mockReturnValue(createTestDb() as ReturnType<typeof getDb>);
  getDb().insert(sessions).values({
    id: SESSION, created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  }).run();
});

describe("GET /api/entries/review", () => {
  it("returns 401 without a session cookie", () => {
    const req = new NextRequest("http://localhost/api/entries/review?date=2026-01-15");
    expect(GET(req).status).toBe(401);
  });

  it("returns empty array when no entries are due", async () => {
    insertEntry("e1", "2026-02-01"); // due in the future
    const body = await GET(authed("http://localhost/api/entries/review?date=2026-01-15")).json();
    expect(body).toEqual([]);
  });

  it("returns entries due on the specified date", async () => {
    insertEntry("e1", "2026-01-15");
    insertEntry("e2", "2026-01-10"); // past due — also included (≤ date)
    insertEntry("e3", "2026-01-16"); // future — excluded
    const body = await GET(authed("http://localhost/api/entries/review?date=2026-01-15")).json() as unknown[];
    expect(body).toHaveLength(2);
  });

  it("excludes entries without next_review", async () => {
    insertEntry("e1", null);
    const body = await GET(authed("http://localhost/api/entries/review?date=2026-01-15")).json();
    expect(body).toEqual([]);
  });

  it("returns data_enc as base64 string", async () => {
    insertEntry("e1", "2026-01-15");
    const body = await GET(authed("http://localhost/api/entries/review?date=2026-01-15")).json() as Record<string, unknown>[];
    expect(typeof body[0].data_enc).toBe("string");
  });

  it("defaults to today when ?date= is omitted (returns due entries)", async () => {
    const today = new Date().toISOString().slice(0, 10);
    insertEntry("e1", today);
    // If the route defaults to today, this entry should appear
    const body = await GET(authed("http://localhost/api/entries/review")).json() as unknown[];
    expect(body).toHaveLength(1);
  });

  it("ignores an invalid date param and uses today as fallback", async () => {
    const today = new Date().toISOString().slice(0, 10);
    insertEntry("e1", today);
    // Invalid date → parseDate returns null → route uses today
    const body = await GET(authed("http://localhost/api/entries/review?date=not-a-date")).json() as unknown[];
    expect(body).toHaveLength(1);
  });
});
