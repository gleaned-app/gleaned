import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db/server", () => ({ getDb: vi.fn() }));

import { NextRequest } from "next/server";
import { getDb } from "@/lib/db/server";
import { createTestDb } from "../_test-db";
import { sessions } from "@/lib/db/schema/server/sessions";
import { threads } from "@/lib/db/schema/shared/threads";
import { GET, POST } from "./route";

const mockGetDb = vi.mocked(getDb);
const SESSION   = "threads_test_session";
const ENC       = Buffer.from(new Uint8Array(32)).toString("base64");

const THREAD_ID  = "aaaaaaaa-0000-0000-0000-000000000001";
const THREAD_ID2 = "aaaaaaaa-0000-0000-0000-000000000002";
const THREAD_ID3 = "aaaaaaaa-0000-0000-0000-000000000003";

function authed(url: string, opts: { method?: string; body?: string; headers?: Record<string, string> } = {}): NextRequest {
  return new NextRequest(url, {
    method: opts.method,
    body: opts.body,
    headers: { ...(opts.headers ?? {}), Cookie: `sid=${SESSION}` },
  });
}

function validThreadBody(id = THREAD_ID): Record<string, unknown> {
  return {
    id,
    done: 0,
    created_at: "2026-01-15T10:00:00.000Z",
    updated_at: "2026-01-15T10:00:00.000Z",
    data_enc: ENC,
  };
}

beforeEach(() => {
  mockGetDb.mockReturnValue(createTestDb() as ReturnType<typeof getDb>);
  getDb().insert(sessions).values({
    id: SESSION, created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  }).run();
});

// ─── Authentication ────────────────────────────────────────────────────────────

describe("GET /api/threads — auth", () => {
  it("returns 401 without a session cookie", () => {
    expect(GET(new NextRequest("http://localhost/api/threads")).status).toBe(401);
  });
});

describe("POST /api/threads — auth", () => {
  it("returns 401 without a session cookie", async () => {
    expect((await POST(new NextRequest("http://localhost/api/threads", { method: "POST" }))).status).toBe(401);
  });
});

// ─── GET ──────────────────────────────────────────────────────────────────────

describe("GET /api/threads", () => {
  it("returns an empty array when there are no threads", async () => {
    expect(await GET(authed("http://localhost/api/threads")).json()).toEqual([]);
  });

  it("returns all threads sorted ascending by created_at", async () => {
    getDb().insert(threads).values([
      { id: THREAD_ID2, done: 0, created_at: "2026-01-20T00:00:00.000Z", updated_at: "2026-01-20T00:00:00.000Z", data_enc: Buffer.from(ENC, "base64") },
      { id: THREAD_ID,  done: 0, created_at: "2026-01-10T00:00:00.000Z", updated_at: "2026-01-10T00:00:00.000Z", data_enc: Buffer.from(ENC, "base64") },
      { id: THREAD_ID3, done: 0, created_at: "2026-01-15T00:00:00.000Z", updated_at: "2026-01-15T00:00:00.000Z", data_enc: Buffer.from(ENC, "base64") },
    ]).run();

    const body = await GET(authed("http://localhost/api/threads")).json() as Record<string, unknown>[];
    expect(body[0].id).toBe(THREAD_ID);  // earliest
    expect(body[2].id).toBe(THREAD_ID2); // latest
  });

  it("returns data_enc as base64 string", async () => {
    getDb().insert(threads).values({
      id: THREAD_ID, done: 0,
      created_at: "2026-01-10T00:00:00.000Z", updated_at: "2026-01-10T00:00:00.000Z",
      data_enc: Buffer.from(ENC, "base64"),
    }).run();

    const body = await GET(authed("http://localhost/api/threads")).json() as Record<string, unknown>[];
    expect(typeof body[0].data_enc).toBe("string");
    expect(body[0].data_enc).toBe(ENC);
  });
});

// ─── POST ─────────────────────────────────────────────────────────────────────

describe("POST /api/threads", () => {
  it("returns 422 for missing required fields", async () => {
    const req = authed("http://localhost/api/threads", {
      method: "POST",
      body: JSON.stringify({ id: THREAD_ID }),
    });
    expect((await POST(req)).status).toBe(422);
  });

  it("returns 422 for non-UUID id", async () => {
    const req = authed("http://localhost/api/threads", {
      method: "POST",
      body: JSON.stringify({ ...validThreadBody(), id: "not-a-uuid" }),
    });
    expect((await POST(req)).status).toBe(422);
  });

  it("returns 422 for done = 2 (only 0 or 1 are valid)", async () => {
    const req = authed("http://localhost/api/threads", {
      method: "POST",
      body: JSON.stringify({ ...validThreadBody(), done: 2 }),
    });
    expect((await POST(req)).status).toBe(422);
  });

  it("returns 422 for invalid due_date format", async () => {
    const req = authed("http://localhost/api/threads", {
      method: "POST",
      body: JSON.stringify({ ...validThreadBody(), due_date: "not-a-date" }),
    });
    expect((await POST(req)).status).toBe(422);
  });

  it("returns 422 for color longer than 50 characters", async () => {
    const req = authed("http://localhost/api/threads", {
      method: "POST",
      body: JSON.stringify({ ...validThreadBody(), color: "x".repeat(51) }),
    });
    expect((await POST(req)).status).toBe(422);
  });

  it("returns 201 and stores the thread for a valid payload", async () => {
    const req = authed("http://localhost/api/threads", {
      method: "POST",
      body: JSON.stringify(validThreadBody()),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(getDb().select().from(threads).all()).toHaveLength(1);
  });

  it("returns data_enc as base64 string in the 201 response", async () => {
    const req = authed("http://localhost/api/threads", {
      method: "POST",
      body: JSON.stringify(validThreadBody()),
    });
    const body = await (await POST(req)).json() as Record<string, unknown>;
    expect(body.data_enc).toBe(ENC);
  });

  it("accepts done = 1 (true/closed state)", async () => {
    const req = authed("http://localhost/api/threads", {
      method: "POST",
      body: JSON.stringify({ ...validThreadBody(), done: 1 }),
    });
    expect((await POST(req)).status).toBe(201);
  });
});
