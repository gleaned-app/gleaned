import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db/server", () => ({ getDb: vi.fn() }));

import { NextRequest } from "next/server";
import { getDb } from "@/lib/db/server";
import { createTestDb } from "../_test-db";
import { sessions } from "@/lib/db/schema/server/sessions";
import { entries } from "@/lib/db/schema/shared/entries";
import { threads } from "@/lib/db/schema/shared/threads";
import { POST } from "./route";

const mockGetDb = vi.mocked(getDb);
const SESSION   = "import_test_session";
const ENC       = Buffer.from(new Uint8Array(32)).toString("base64");

const ENTRY_ID  = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const THREAD_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

function authed(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/import", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      Cookie: `sid=${SESSION}`,
    },
  });
}

function validEntry(id = ENTRY_ID): Record<string, unknown> {
  return {
    id,
    date: "2026-01-15",
    created_at: "2026-01-15T10:00:00.000Z",
    updated_at: "2026-01-15T10:00:00.000Z",
    data_enc: ENC,
  };
}

function validThread(id = THREAD_ID): Record<string, unknown> {
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

describe("POST /api/import — auth", () => {
  it("returns 401 without a session cookie", async () => {
    const req = new NextRequest("http://localhost/api/import", { method: "POST" });
    expect((await POST(req)).status).toBe(401);
  });
});

// ─── Body validation ──────────────────────────────────────────────────────────

describe("POST /api/import — body validation", () => {
  it("returns 400 when body is not an object (plain string)", async () => {
    const req = new NextRequest("http://localhost/api/import", {
      method: "POST",
      body: '"just a string"',
      headers: { Cookie: `sid=${SESSION}`, "Content-Type": "application/json" },
    });
    expect((await POST(req)).status).toBe(400);
  });

  it("returns 400 for null body (non-JSON)", async () => {
    const req = new NextRequest("http://localhost/api/import", {
      method: "POST",
      body: "null",
      headers: { Cookie: `sid=${SESSION}`, "Content-Type": "application/json" },
    });
    expect((await POST(req)).status).toBe(400);
  });

  it("returns 400 when body is a JSON array (not an object)", async () => {
    const req = new NextRequest("http://localhost/api/import", {
      method: "POST",
      body: "[]",
      headers: { Cookie: `sid=${SESSION}`, "Content-Type": "application/json" },
    });
    expect((await POST(req)).status).toBe(400);
  });
});

// ─── Import counting ──────────────────────────────────────────────────────────

describe("POST /api/import — result counting", () => {
  it("reports imported and skipped counts", async () => {
    const body = await (await POST(authed({
      entries: [validEntry(), { id: "bad" }], // 1 valid, 1 invalid
      threads: [validThread()],
    }))).json() as Record<string, unknown>;
    expect((body.imported as Record<string, number>).entries).toBe(1);
    expect((body.imported as Record<string, number>).threads).toBe(1);
    expect((body.skipped as Record<string, number>).entries).toBe(1);
    expect((body.skipped as Record<string, number>).threads).toBe(0);
  });

  it("returns 0 imported when all records are invalid", async () => {
    const body = await (await POST(authed({
      entries: [{ id: "not-a-uuid" }, { data_enc: "short" }],
      threads: [{ done: 99 }],
    }))).json() as Record<string, unknown>;
    expect((body.imported as Record<string, number>).entries).toBe(0);
    expect((body.imported as Record<string, number>).threads).toBe(0);
  });

  it("treats absent entries/threads keys as empty arrays", async () => {
    const body = await (await POST(authed({ other_key: 42 }))).json() as Record<string, unknown>;
    expect((body.imported as Record<string, number>).entries).toBe(0);
    expect((body.imported as Record<string, number>).threads).toBe(0);
  });

  it("treats non-array entries as an empty array (skips gracefully)", async () => {
    const body = await (await POST(authed({ entries: "not-an-array" }))).json() as Record<string, unknown>;
    expect((body.imported as Record<string, number>).entries).toBe(0);
  });
});

// ─── DB state after import ────────────────────────────────────────────────────

describe("POST /api/import — DB state", () => {
  it("inserts valid entries into the DB", async () => {
    await POST(authed({ entries: [validEntry()] }));
    expect(getDb().select().from(entries).all()).toHaveLength(1);
  });

  it("inserts valid threads into the DB", async () => {
    await POST(authed({ threads: [validThread()] }));
    expect(getDb().select().from(threads).all()).toHaveLength(1);
  });

  it("is idempotent: re-importing the same entry does not create a duplicate", async () => {
    await POST(authed({ entries: [validEntry()] }));
    await POST(authed({ entries: [validEntry()] })); // same id → upsert
    expect(getDb().select().from(entries).all()).toHaveLength(1);
  });

  it("is idempotent: re-importing the same thread does not create a duplicate", async () => {
    await POST(authed({ threads: [validThread()] }));
    await POST(authed({ threads: [validThread()] }));
    expect(getDb().select().from(threads).all()).toHaveLength(1);
  });

  it("skips invalid entries without aborting the valid ones", async () => {
    const second = "cccccccc-cccc-cccc-cccc-cccccccccccd";
    await POST(authed({
      entries: [
        { id: "bad-uuid", date: "2026-01-01", data_enc: ENC }, // invalid
        validEntry(second),                                     // valid
      ],
    }));
    const rows = getDb().select().from(entries).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(second);
  });

  it("stores review_interval when provided", async () => {
    const e = { ...validEntry(), next_review: "2026-01-20T00:00:00.000Z", review_interval: 5 };
    await POST(authed({ entries: [e] }));
    const row = getDb().select().from(entries).get();
    expect(row?.review_interval).toBe(5);
  });
});

// ─── Security: validation edge cases ─────────────────────────────────────────

describe("POST /api/import — security / validation edge cases", () => {
  it("rejects review_interval = 0 (must be positive)", async () => {
    const body = await (await POST(authed({ entries: [{ ...validEntry(), review_interval: 0 }] }))).json() as Record<string, unknown>;
    expect((body.imported as Record<string, number>).entries).toBe(0);
    expect((body.skipped as Record<string, number>).entries).toBe(1);
  });

  it("rejects data_enc shorter than AES-GCM minimum length", async () => {
    const body = await (await POST(authed({ entries: [{ ...validEntry(), data_enc: "AAAA" }] }))).json() as Record<string, unknown>;
    expect((body.skipped as Record<string, number>).entries).toBe(1);
  });

  it("rejects entries with path-traversal-style id", async () => {
    const body = await (await POST(authed({ entries: [{ ...validEntry(), id: "../../etc/passwd" }] }))).json() as Record<string, unknown>;
    expect((body.skipped as Record<string, number>).entries).toBe(1);
  });

  it("rejects threads with done = -1", async () => {
    const body = await (await POST(authed({ threads: [{ ...validThread(), done: -1 }] }))).json() as Record<string, unknown>;
    expect((body.skipped as Record<string, number>).threads).toBe(1);
  });

  it("rejects threads with color > 50 characters", async () => {
    const body = await (await POST(authed({ threads: [{ ...validThread(), color: "x".repeat(51) }] }))).json() as Record<string, unknown>;
    expect((body.skipped as Record<string, number>).threads).toBe(1);
  });
});
