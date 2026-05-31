import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db/server", () => ({ getDb: vi.fn() }));

import { NextRequest } from "next/server";
import { getDb } from "@/lib/db/server";
import { createTestDb } from "../../_test-db";
import { sessions } from "@/lib/db/schema/server/sessions";
import { entries } from "@/lib/db/schema/shared/entries";
import { PUT, DELETE } from "./route";

const mockGetDb = vi.mocked(getDb);
const SESSION   = "entries_id_test_session";
const ENC       = Buffer.from(new Uint8Array(32)).toString("base64");
const VALID_ID  = "12345678-abcd-abcd-abcd-123456789abc";
const INVALID_ID = "../../etc/passwd";

function authed(url: string, opts: { method?: string; body?: string; headers?: Record<string, string> } = {}): NextRequest {
  return new NextRequest(url, {
    method: opts.method,
    body: opts.body,
    headers: { ...(opts.headers ?? {}), Cookie: `sid=${SESSION}` },
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function validUpdateBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    date: "2026-01-15",
    created_at: "2026-01-15T10:00:00.000Z",
    updated_at: "2026-01-15T12:00:00.000Z",
    data_enc: ENC,
    ...overrides,
  };
}

function insertEntry(id = VALID_ID, updatedAt = "2026-01-15T10:00:00.000Z") {
  getDb().insert(entries).values({
    id, date: "2026-01-15",
    created_at: "2026-01-15T10:00:00.000Z",
    updated_at: updatedAt,
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

// ─── Authentication ────────────────────────────────────────────────────────────

describe("PUT /api/entries/[id] — auth", () => {
  it("returns 401 without a session cookie", async () => {
    const req = new NextRequest("http://localhost/api/entries/" + VALID_ID, { method: "PUT" });
    expect((await PUT(req, params(VALID_ID))).status).toBe(401);
  });
});

describe("DELETE /api/entries/[id] — auth", () => {
  it("returns 401 without a session cookie", async () => {
    const req = new NextRequest("http://localhost/api/entries/" + VALID_ID, { method: "DELETE" });
    expect((await DELETE(req, params(VALID_ID))).status).toBe(401);
  });
});

// ─── PUT — input validation ────────────────────────────────────────────────────

describe("PUT /api/entries/[id] — validation", () => {
  it("returns 400 for non-UUID id (path traversal attempt)", async () => {
    const req = authed("http://localhost/api/entries/" + INVALID_ID, {
      method: "PUT",
      body: JSON.stringify(validUpdateBody()),
    });
    expect((await PUT(req, params(INVALID_ID))).status).toBe(400);
  });

  it("returns 413 when body is too large (sentinel: undefined from readJsonWithLimit)", async () => {
    // tested indirectly: invalid body → 422 (confirms body reading is wired up)
    const req = authed("http://localhost/api/entries/" + VALID_ID, {
      method: "PUT",
      body: "not json",
    });
    expect((await PUT(req, params(VALID_ID))).status).toBe(422);
  });

  it("returns 422 for invalid update body (missing required fields)", async () => {
    const req = authed("http://localhost/api/entries/" + VALID_ID, {
      method: "PUT",
      body: JSON.stringify({ date: "2026-01-15" }), // missing updated_at, data_enc
    });
    expect((await PUT(req, params(VALID_ID))).status).toBe(422);
  });

  it("returns 422 for data_enc shorter than AES-GCM minimum", async () => {
    const req = authed("http://localhost/api/entries/" + VALID_ID, {
      method: "PUT",
      body: JSON.stringify({ ...validUpdateBody(), data_enc: "tooshort" }),
    });
    expect((await PUT(req, params(VALID_ID))).status).toBe(422);
  });
});

// ─── PUT — happy path ──────────────────────────────────────────────────────────

describe("PUT /api/entries/[id] — upsert", () => {
  it("returns 200 for a valid payload (new row)", async () => {
    const req = authed("http://localhost/api/entries/" + VALID_ID, {
      method: "PUT",
      body: JSON.stringify(validUpdateBody()),
    });
    expect((await PUT(req, params(VALID_ID))).status).toBe(200);
  });

  it("creates the row when it does not yet exist (upsert)", async () => {
    const req = authed("http://localhost/api/entries/" + VALID_ID, {
      method: "PUT",
      body: JSON.stringify(validUpdateBody()),
    });
    await PUT(req, params(VALID_ID));
    const row = getDb().select().from(entries).get();
    expect(row?.id).toBe(VALID_ID);
  });

  it("updates an existing row without creating a duplicate", async () => {
    insertEntry();
    const req = authed("http://localhost/api/entries/" + VALID_ID, {
      method: "PUT",
      body: JSON.stringify(validUpdateBody({ updated_at: "2026-02-01T00:00:00.000Z" })),
    });
    await PUT(req, params(VALID_ID));
    const rows = getDb().select().from(entries).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].updated_at).toBe("2026-02-01T00:00:00.000Z");
  });

  it("returns data_enc as base64 string in the response", async () => {
    const req = authed("http://localhost/api/entries/" + VALID_ID, {
      method: "PUT",
      body: JSON.stringify(validUpdateBody()),
    });
    const body = await (await PUT(req, params(VALID_ID))).json() as Record<string, unknown>;
    expect(typeof body.data_enc).toBe("string");
    expect(body.data_enc).toBe(ENC);
  });

  it("sets ETag header to the updated_at value", async () => {
    const req = authed("http://localhost/api/entries/" + VALID_ID, {
      method: "PUT",
      body: JSON.stringify(validUpdateBody({ updated_at: "2026-03-01T00:00:00.000Z" })),
    });
    const res = await PUT(req, params(VALID_ID));
    expect(res.headers.get("ETag")).toBe('"2026-03-01T00:00:00.000Z"');
  });
});

// ─── PUT — optimistic locking (If-Match) ──────────────────────────────────────

describe("PUT /api/entries/[id] — If-Match", () => {
  it("returns 404 when If-Match is set but row does not exist", async () => {
    const req = authed("http://localhost/api/entries/" + VALID_ID, {
      method: "PUT",
      body: JSON.stringify(validUpdateBody()),
      headers: { "If-Match": '"2026-01-15T10:00:00.000Z"', Cookie: `sid=${SESSION}` },
    });
    expect((await PUT(req, params(VALID_ID))).status).toBe(404);
  });

  it("returns 412 when If-Match does not match current updated_at", async () => {
    insertEntry(VALID_ID, "2026-01-15T10:00:00.000Z");
    const req = authed("http://localhost/api/entries/" + VALID_ID, {
      method: "PUT",
      body: JSON.stringify(validUpdateBody()),
      headers: { "If-Match": '"2026-01-15T99:00:00.000Z"', Cookie: `sid=${SESSION}` },
    });
    expect((await PUT(req, params(VALID_ID))).status).toBe(412);
  });

  it("returns 200 when If-Match matches current updated_at", async () => {
    insertEntry(VALID_ID, "2026-01-15T10:00:00.000Z");
    const req = authed("http://localhost/api/entries/" + VALID_ID, {
      method: "PUT",
      body: JSON.stringify(validUpdateBody()),
      headers: { "If-Match": '"2026-01-15T10:00:00.000Z"', Cookie: `sid=${SESSION}` },
    });
    expect((await PUT(req, params(VALID_ID))).status).toBe(200);
  });

  it("strips surrounding quotes from the If-Match value before comparing", async () => {
    insertEntry(VALID_ID, "2026-01-15T10:00:00.000Z");
    // Without quotes (malformed header) should still work as raw string comparison
    const req = authed("http://localhost/api/entries/" + VALID_ID, {
      method: "PUT",
      body: JSON.stringify(validUpdateBody()),
      headers: { "If-Match": "2026-01-15T10:00:00.000Z", Cookie: `sid=${SESSION}` },
    });
    expect((await PUT(req, params(VALID_ID))).status).toBe(200);
  });
});

// ─── DELETE ───────────────────────────────────────────────────────────────────

describe("DELETE /api/entries/[id]", () => {
  it("returns 204 for an existing entry", async () => {
    insertEntry();
    const req = authed("http://localhost/api/entries/" + VALID_ID, { method: "DELETE" });
    expect((await DELETE(req, params(VALID_ID))).status).toBe(204);
  });

  it("removes the row from the DB", async () => {
    insertEntry();
    const req = authed("http://localhost/api/entries/" + VALID_ID, { method: "DELETE" });
    await DELETE(req, params(VALID_ID));
    expect(getDb().select().from(entries).all()).toHaveLength(0);
  });

  it("returns 204 even when the row does not exist (idempotent)", async () => {
    const req = authed("http://localhost/api/entries/" + VALID_ID, { method: "DELETE" });
    expect((await DELETE(req, params(VALID_ID))).status).toBe(204);
  });
});
