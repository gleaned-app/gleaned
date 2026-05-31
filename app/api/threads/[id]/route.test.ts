import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db/server", () => ({ getDb: vi.fn() }));

import { NextRequest } from "next/server";
import { getDb } from "@/lib/db/server";
import { createTestDb } from "../../_test-db";
import { sessions } from "@/lib/db/schema/server/sessions";
import { threads } from "@/lib/db/schema/shared/threads";
import { PUT, DELETE } from "./route";

const mockGetDb  = vi.mocked(getDb);
const SESSION    = "threads_id_test_session";
const ENC        = Buffer.from(new Uint8Array(32)).toString("base64");
const VALID_ID   = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const INVALID_ID = "../../etc/shadow";

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function authed(url: string, opts: { method?: string; body?: string; headers?: Record<string, string> } = {}): NextRequest {
  return new NextRequest(url, {
    method: opts.method,
    body: opts.body,
    headers: { ...(opts.headers ?? {}), Cookie: `sid=${SESSION}` },
  });
}

function validUpdateBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    created_at: "2026-01-15T10:00:00.000Z",
    updated_at: "2026-01-15T12:00:00.000Z",
    done: 0,
    data_enc: ENC,
    ...overrides,
  };
}

function insertThread(id = VALID_ID) {
  getDb().insert(threads).values({
    id, done: 0,
    created_at: "2026-01-15T10:00:00.000Z", updated_at: "2026-01-15T10:00:00.000Z",
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

describe("PUT /api/threads/[id] — auth", () => {
  it("returns 401 without a session cookie", async () => {
    const req = new NextRequest("http://localhost/api/threads/" + VALID_ID, { method: "PUT" });
    expect((await PUT(req, params(VALID_ID))).status).toBe(401);
  });
});

describe("DELETE /api/threads/[id] — auth", () => {
  it("returns 401 without a session cookie", async () => {
    const req = new NextRequest("http://localhost/api/threads/" + VALID_ID, { method: "DELETE" });
    expect((await DELETE(req, params(VALID_ID))).status).toBe(401);
  });
});

// ─── PUT — validation ─────────────────────────────────────────────────────────

describe("PUT /api/threads/[id] — validation", () => {
  it("returns 400 for non-UUID id (path traversal attempt)", async () => {
    const req = authed("http://localhost/api/threads/" + INVALID_ID, {
      method: "PUT",
      body: JSON.stringify(validUpdateBody()),
    });
    expect((await PUT(req, params(INVALID_ID))).status).toBe(400);
  });

  it("returns 422 for invalid update body", async () => {
    const req = authed("http://localhost/api/threads/" + VALID_ID, {
      method: "PUT",
      body: JSON.stringify({ done: 0 }), // missing created_at, updated_at, data_enc
    });
    expect((await PUT(req, params(VALID_ID))).status).toBe(422);
  });

  it("returns 422 for done = 42 (only 0/1 allowed)", async () => {
    const req = authed("http://localhost/api/threads/" + VALID_ID, {
      method: "PUT",
      body: JSON.stringify({ ...validUpdateBody(), done: 42 }),
    });
    expect((await PUT(req, params(VALID_ID))).status).toBe(422);
  });

  it("returns 422 for due_date with invalid calendar date (Feb 30)", async () => {
    const req = authed("http://localhost/api/threads/" + VALID_ID, {
      method: "PUT",
      body: JSON.stringify({ ...validUpdateBody(), due_date: "2026-02-30" }),
    });
    expect((await PUT(req, params(VALID_ID))).status).toBe(422);
  });
});

// ─── PUT — happy path ─────────────────────────────────────────────────────────

describe("PUT /api/threads/[id] — upsert", () => {
  it("returns 200 for a valid payload (new row)", async () => {
    const req = authed("http://localhost/api/threads/" + VALID_ID, {
      method: "PUT",
      body: JSON.stringify(validUpdateBody()),
    });
    expect((await PUT(req, params(VALID_ID))).status).toBe(200);
  });

  it("upserts: creates the thread when it does not exist", async () => {
    const req = authed("http://localhost/api/threads/" + VALID_ID, {
      method: "PUT",
      body: JSON.stringify(validUpdateBody()),
    });
    await PUT(req, params(VALID_ID));
    expect(getDb().select().from(threads).all()).toHaveLength(1);
  });

  it("upserts: updates an existing thread without creating a duplicate", async () => {
    insertThread();
    const req = authed("http://localhost/api/threads/" + VALID_ID, {
      method: "PUT",
      body: JSON.stringify(validUpdateBody({ done: 1 })),
    });
    await PUT(req, params(VALID_ID));
    const rows = getDb().select().from(threads).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].done).toBe(1);
  });

  it("returns data_enc as base64 string in the response", async () => {
    const req = authed("http://localhost/api/threads/" + VALID_ID, {
      method: "PUT",
      body: JSON.stringify(validUpdateBody()),
    });
    const body = await (await PUT(req, params(VALID_ID))).json() as Record<string, unknown>;
    expect(body.data_enc).toBe(ENC);
  });
});

// ─── DELETE ───────────────────────────────────────────────────────────────────

describe("DELETE /api/threads/[id]", () => {
  it("returns 204 for an existing thread", async () => {
    insertThread();
    const req = authed("http://localhost/api/threads/" + VALID_ID, { method: "DELETE" });
    expect((await DELETE(req, params(VALID_ID))).status).toBe(204);
  });

  it("removes the row from the DB", async () => {
    insertThread();
    await DELETE(authed("http://localhost/api/threads/" + VALID_ID, { method: "DELETE" }), params(VALID_ID));
    expect(getDb().select().from(threads).all()).toHaveLength(0);
  });

  it("returns 204 even when the thread does not exist (idempotent)", async () => {
    const req = authed("http://localhost/api/threads/" + VALID_ID, { method: "DELETE" });
    expect((await DELETE(req, params(VALID_ID))).status).toBe(204);
  });
});
