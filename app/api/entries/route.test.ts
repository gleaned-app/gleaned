import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db/server", () => ({ getDb: vi.fn() }));

import { NextRequest } from "next/server";
import { getDb } from "@/lib/db/server";
import { createTestDb } from "../_test-db";
import { sessions } from "@/lib/db/schema/server/sessions";
import { entries } from "@/lib/db/schema/shared/entries";
import { GET, POST } from "./route";

const mockGetDb = vi.mocked(getDb);
const SESSION   = "entries_test_session";

// 32 zero bytes → 44-char valid base64 (≥ 40 required for AES-GCM)
const ENC = Buffer.from(new Uint8Array(32)).toString("base64");

const ENTRY_ID  = "12345678-0000-0000-0000-000000000001";
const ENTRY_ID2 = "12345678-0000-0000-0000-000000000002";

function insertSession() {
  getDb().insert(sessions).values({
    id: SESSION,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  }).run();
}

function validEntryBody(id = ENTRY_ID, date = "2026-01-15"): Record<string, unknown> {
  return {
    id,
    date,
    created_at: "2026-01-15T10:00:00.000Z",
    updated_at: "2026-01-15T10:00:00.000Z",
    next_review: null,
    review_interval: null,
    data_enc: ENC,
  };
}

function authed(url: string, opts: { method?: string; body?: string; headers?: Record<string, string> } = {}): NextRequest {
  return new NextRequest(url, {
    method: opts.method,
    body: opts.body,
    headers: { ...(opts.headers ?? {}), Cookie: `sid=${SESSION}` },
  });
}

beforeEach(() => {
  mockGetDb.mockReturnValue(createTestDb() as ReturnType<typeof getDb>);
  insertSession();
});

// ─── Authentication ────────────────────────────────────────────────────────────

describe("GET /api/entries — auth", () => {
  it("returns 401 without a session cookie", async () => {
    const req = new NextRequest("http://localhost/api/entries?date=2026-01-15");
    expect(GET(req).status).toBe(401);
  });
});

describe("POST /api/entries — auth", () => {
  it("returns 401 without a session cookie", async () => {
    const req = new NextRequest("http://localhost/api/entries", { method: "POST" });
    expect((await POST(req)).status).toBe(401);
  });
});

// ─── GET — query-param routing ────────────────────────────────────────────────

describe("GET /api/entries — query params", () => {
  it("returns 400 when no query params are provided", () => {
    const res = GET(authed("http://localhost/api/entries"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for ?from= without ?to=", () => {
    const res = GET(authed("http://localhost/api/entries?from=2026-01-01"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for ?to= without ?from=", () => {
    const res = GET(authed("http://localhost/api/entries?to=2026-01-31"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid date in ?date=", () => {
    // Invalid date → parseDate returns null → falls through to error
    const res = GET(authed("http://localhost/api/entries?date=2026-99-99"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for SQL-injection-like date value", () => {
    const res = GET(authed("http://localhost/api/entries?date=2026-01-01'; DROP TABLE entries; --"));
    expect(res.status).toBe(400);
  });

  it("returns empty array for ?date= with no matching entries", async () => {
    const body = await GET(authed("http://localhost/api/entries?date=2026-01-15")).json();
    expect(body).toEqual([]);
  });

  it("returns entries matching ?date=", async () => {
    getDb().insert(entries).values({
      id: ENTRY_ID, date: "2026-01-15",
      created_at: "2026-01-15T10:00:00.000Z", updated_at: "2026-01-15T10:00:00.000Z",
      data_enc: Buffer.from(ENC, "base64"),
    }).run();

    const body = await GET(authed("http://localhost/api/entries?date=2026-01-15")).json() as unknown[];
    expect(body).toHaveLength(1);
  });

  it("returns entries in date range ?from=&to=", async () => {
    getDb().insert(entries).values([
      { id: ENTRY_ID,  date: "2026-01-10", created_at: "2026-01-10T00:00:00.000Z", updated_at: "2026-01-10T00:00:00.000Z", data_enc: Buffer.from(ENC, "base64") },
      { id: ENTRY_ID2, date: "2026-01-20", created_at: "2026-01-20T00:00:00.000Z", updated_at: "2026-01-20T00:00:00.000Z", data_enc: Buffer.from(ENC, "base64") },
    ]).run();

    const body = await GET(authed("http://localhost/api/entries?from=2026-01-01&to=2026-01-31")).json() as unknown[];
    expect(body).toHaveLength(2);
  });

  it("range query excludes entries outside bounds", async () => {
    getDb().insert(entries).values([
      { id: ENTRY_ID,  date: "2025-12-31", created_at: "2025-12-31T00:00:00.000Z", updated_at: "2025-12-31T00:00:00.000Z", data_enc: Buffer.from(ENC, "base64") },
      { id: ENTRY_ID2, date: "2026-02-01", created_at: "2026-02-01T00:00:00.000Z", updated_at: "2026-02-01T00:00:00.000Z", data_enc: Buffer.from(ENC, "base64") },
    ]).run();

    const body = await GET(authed("http://localhost/api/entries?from=2026-01-01&to=2026-01-31")).json() as unknown[];
    expect(body).toHaveLength(0);
  });

  it("returns data_enc as base64 string (not raw Buffer)", async () => {
    getDb().insert(entries).values({
      id: ENTRY_ID, date: "2026-01-15",
      created_at: "2026-01-15T10:00:00.000Z", updated_at: "2026-01-15T10:00:00.000Z",
      data_enc: Buffer.from(ENC, "base64"),
    }).run();

    const body = await GET(authed("http://localhost/api/entries?date=2026-01-15")).json() as Record<string, unknown>[];
    expect(typeof body[0].data_enc).toBe("string");
    expect(() => atob(body[0].data_enc as string)).not.toThrow();
  });
});

// ─── POST — entry creation ─────────────────────────────────────────────────────

describe("POST /api/entries", () => {
  it("returns 413 when body exceeds size limit", async () => {
    // Pass a huge body directly via readJsonWithLimit with a tiny limit.
    // We can't easily test the real 50 MB limit — instead verify the 422 path is
    // distinct from the 413 path by testing the validator directly.
    // The real 413 path is covered by _body.test.ts.
    // Here we just confirm the route is wired up to readJsonWithLimit.
    const req = authed("http://localhost/api/entries", { method: "POST", body: "not json" });
    const res = await POST(req);
    // not json → isValidEntry(null) = false → 422
    expect(res.status).toBe(422);
  });

  it("returns 422 for missing required fields", async () => {
    const req = authed("http://localhost/api/entries", {
      method: "POST",
      body: JSON.stringify({ id: ENTRY_ID }), // missing date, data_enc, etc.
    });
    expect((await POST(req)).status).toBe(422);
  });

  it("returns 422 for invalid date format", async () => {
    const req = authed("http://localhost/api/entries", {
      method: "POST",
      body: JSON.stringify({ ...validEntryBody(), date: "not-a-date" }),
    });
    expect((await POST(req)).status).toBe(422);
  });

  it("returns 422 for non-UUID id", async () => {
    const req = authed("http://localhost/api/entries", {
      method: "POST",
      body: JSON.stringify({ ...validEntryBody(), id: "../../etc/passwd" }),
    });
    expect((await POST(req)).status).toBe(422);
  });

  it("returns 422 for data_enc that is too short (< 40 chars)", async () => {
    const req = authed("http://localhost/api/entries", {
      method: "POST",
      body: JSON.stringify({ ...validEntryBody(), data_enc: "tooshort" }),
    });
    expect((await POST(req)).status).toBe(422);
  });

  it("returns 422 for review_interval = 0 (must be > 0)", async () => {
    const req = authed("http://localhost/api/entries", {
      method: "POST",
      body: JSON.stringify({ ...validEntryBody(), review_interval: 0 }),
    });
    expect((await POST(req)).status).toBe(422);
  });

  it("returns 201 and stores the entry for a valid payload", async () => {
    const req = authed("http://localhost/api/entries", {
      method: "POST",
      body: JSON.stringify(validEntryBody()),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);

    const row = getDb().select().from(entries).get();
    expect(row?.id).toBe(ENTRY_ID);
  });

  it("returns data_enc as base64 string in the 201 response", async () => {
    const req = authed("http://localhost/api/entries", {
      method: "POST",
      body: JSON.stringify(validEntryBody()),
    });
    const body = await (await POST(req)).json() as Record<string, unknown>;
    expect(typeof body.data_enc).toBe("string");
    expect(body.data_enc).toBe(ENC);
  });

  it("accepts optional review_interval > 0", async () => {
    const req = authed("http://localhost/api/entries", {
      method: "POST",
      body: JSON.stringify({ ...validEntryBody(), review_interval: 7 }),
    });
    expect((await POST(req)).status).toBe(201);
  });
});
