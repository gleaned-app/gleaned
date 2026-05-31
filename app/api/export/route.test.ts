import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db/server", () => ({ getDb: vi.fn() }));

import { NextRequest } from "next/server";
import { getDb } from "@/lib/db/server";
import { createTestDb } from "../_test-db";
import { sessions } from "@/lib/db/schema/server/sessions";
import { entries } from "@/lib/db/schema/shared/entries";
import { threads } from "@/lib/db/schema/shared/threads";
import { GET } from "./route";

const mockGetDb = vi.mocked(getDb);
const SESSION   = "export_test_session";
const ENC       = Buffer.from(new Uint8Array(32)).toString("base64");

const ENTRY_ID  = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const THREAD_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff";

function authed(): NextRequest {
  return new NextRequest("http://localhost/api/export", {
    headers: { Cookie: `sid=${SESSION}` },
  });
}

beforeEach(() => {
  mockGetDb.mockReturnValue(createTestDb() as ReturnType<typeof getDb>);
  getDb().insert(sessions).values({
    id: SESSION, created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  }).run();
});

describe("GET /api/export", () => {
  it("returns 401 without a session cookie", () => {
    expect(GET(new NextRequest("http://localhost/api/export")).status).toBe(401);
  });

  it("returns version = 1 and a UTC exported_at timestamp", async () => {
    const body = await GET(authed()).json() as Record<string, unknown>;
    expect(body.version).toBe(1);
    expect(typeof body.exported_at).toBe("string");
    expect(() => new Date(body.exported_at as string)).not.toThrow();
  });

  it("returns empty entries and threads arrays when DB is empty", async () => {
    const body = await GET(authed()).json() as Record<string, unknown>;
    expect(body.entries).toEqual([]);
    expect(body.threads).toEqual([]);
  });

  it("exports all entries with data_enc as base64 string", async () => {
    getDb().insert(entries).values({
      id: ENTRY_ID, date: "2026-01-15",
      created_at: "2026-01-15T10:00:00.000Z", updated_at: "2026-01-15T10:00:00.000Z",
      data_enc: Buffer.from(ENC, "base64"),
    }).run();

    const body = await GET(authed()).json() as Record<string, unknown>;
    const exported = (body.entries as Record<string, unknown>[]);
    expect(exported).toHaveLength(1);
    expect(exported[0].id).toBe(ENTRY_ID);
    expect(typeof exported[0].data_enc).toBe("string");
    expect(() => atob(exported[0].data_enc as string)).not.toThrow();
  });

  it("exports all threads with data_enc as base64 string", async () => {
    getDb().insert(threads).values({
      id: THREAD_ID, done: 0,
      created_at: "2026-01-15T10:00:00.000Z", updated_at: "2026-01-15T10:00:00.000Z",
      data_enc: Buffer.from(ENC, "base64"),
    }).run();

    const body = await GET(authed()).json() as Record<string, unknown>;
    const exported = (body.threads as Record<string, unknown>[]);
    expect(exported).toHaveLength(1);
    expect(exported[0].id).toBe(THREAD_ID);
    expect(typeof exported[0].data_enc).toBe("string");
  });

  it("does not expose any auth or server-side fields (password_verifier, etc.)", async () => {
    const body = await GET(authed()).json() as Record<string, unknown>;
    expect(body.password_verifier).toBeUndefined();
    expect(body.encryption_salt).toBeUndefined();
    expect(body.sessions).toBeUndefined();
  });
});
