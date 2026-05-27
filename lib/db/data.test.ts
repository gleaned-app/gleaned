import { describe, it, expect, vi, beforeEach } from "vitest";
import { importData, exportData } from "./data";
import { setAuthState } from "./client";

vi.mock("../api-client", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("./entry-crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./entry-crypto")>();
  return {
    ...actual,
    encryptEntryToApi: vi.fn(async (e: unknown) => ({
      id: (e as { _id: string })._id,
      date: "2024-01-01",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      next_review: null,
      review_interval: null,
      data_enc: "base64enc",
    })),
    decryptEntryFromRow: vi.fn(async (r: unknown) => r),
  };
});

vi.mock("./thread-crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./thread-crypto")>();
  return {
    ...actual,
    encryptThreadToApi: vi.fn(async (t: unknown) => ({
      id: (t as { _id: string })._id,
      done: 0,
      due_date: null,
      color: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      data_enc: "base64enc",
    })),
    decryptThreadFromRow: vi.fn(async (r: unknown) => r),
  };
});

import { apiFetch } from "../api-client";
const mockApiFetch = vi.mocked(apiFetch);

function makeResponse(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  setAuthState("authenticated");
  vi.clearAllMocks();
});

// ─── exportData ───────────────────────────────────────────────────────────────

describe("exportData", () => {
  it("fetches from /api/export and returns formatted JSON", async () => {
    const payload = { version: 1, exported_at: "2024-01-01T00:00:00Z", entries: [], threads: [] };
    mockApiFetch.mockResolvedValue(makeResponse(payload));

    const result = await exportData();
    const parsed = JSON.parse(result);

    expect(mockApiFetch).toHaveBeenCalledWith("/api/export");
    expect(parsed.version).toBe(1);
    expect(Array.isArray(parsed.entries)).toBe(true);
  });
});

// ─── importData — new SQLite format ──────────────────────────────────────────

describe("importData (new SQLite format)", () => {
  it("passes entries and threads directly to /api/import", async () => {
    const exportJson = JSON.stringify({
      version: 1,
      exported_at: "2024-01-01T00:00:00Z",
      entries: [{ id: "entry_1_abc", data_enc: "enc" }],
      threads: [{ id: "thread_1_def", data_enc: "enc" }],
    });
    mockApiFetch.mockResolvedValue(
      makeResponse({ imported: { entries: 1, threads: 1 }, skipped: { entries: 0, threads: 0 } }),
    );

    const result = await importData(exportJson);

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/import",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);
  });
});

// ─── importData — old PouchDB format ─────────────────────────────────────────

describe("importData (old PouchDB format)", () => {
  it("re-encrypts and imports valid entry docs", async () => {
    const exportJson = JSON.stringify({
      version: 1,
      docs: [
        {
          _id: "entry_1_abc",
          type: "entry",
          content: "test content",
          tags: ["tag1"],
          date: "2024-01-01",
          createdAt: "2024-01-01T00:00:00Z",
        },
      ],
    });
    mockApiFetch.mockResolvedValue(
      makeResponse({ imported: { entries: 1, threads: 0 }, skipped: { entries: 0, threads: 0 } }),
    );

    const result = await importData(exportJson);

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/import",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.imported).toBe(1);
  });

  it("skips docs with invalid ID patterns", async () => {
    const exportJson = JSON.stringify({
      docs: [
        { _id: "_design/gleaned", type: "entry", content: "x", tags: [], date: "2024-01-01", createdAt: new Date().toISOString() },
        { _id: "gleaned_settings", type: "settings" },
      ],
    });

    const result = await importData(exportJson);

    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(result.skipped).toBe(2);
    expect(result.imported).toBe(0);
  });

  it("skips encrypted docs (cannot decrypt without original key)", async () => {
    const exportJson = JSON.stringify({
      docs: [
        { _id: "entry_1_abc", type: "entry", encrypted: true, enc: "ciphertext" },
      ],
    });

    const result = await importData(exportJson);

    expect(result.skipped).toBe(1);
    expect(result.imported).toBe(0);
  });

  it("skips entries missing required fields", async () => {
    const exportJson = JSON.stringify({
      docs: [
        { _id: "entry_1_abc", type: "entry" },        // missing content, tags, date
        { _id: "entry_2_def", type: "entry", content: "ok", tags: [], date: "bad-date", createdAt: new Date().toISOString() }, // bad date
      ],
    });

    const result = await importData(exportJson);

    expect(result.skipped).toBe(2);
  });

  it("imports valid thread docs", async () => {
    const exportJson = JSON.stringify({
      docs: [
        { _id: "thread_1_abc", type: "thread", text: "task", done: false, createdAt: new Date().toISOString() },
      ],
    });
    mockApiFetch.mockResolvedValue(
      makeResponse({ imported: { entries: 0, threads: 1 }, skipped: { entries: 0, threads: 0 } }),
    );

    const result = await importData(exportJson);

    expect(result.imported).toBe(1);
  });
});
