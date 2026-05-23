import { describe, it, expect, vi, beforeEach } from "vitest";
import { importData } from "./data";
import { setAuthState, type AnyDoc } from "./client";

// ─── Mocks ────────────────────────────────────────────────────────────────────
// data.ts calls getDB() (PouchDB) and encrypt/decrypt helpers.
// We mock at the module boundary so tests stay fast and offline.

vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return {
    ...actual,
    // getDB returns a minimal PouchDB-shaped object with controllable behaviour.
    getDB: vi.fn(),
  };
});

vi.mock("./entry-crypto", () => ({
  encryptEntry: vi.fn(async (doc: unknown) => doc),
  decryptEntry: vi.fn(async (doc: unknown) => doc),
}));

vi.mock("./thread-crypto", () => ({
  encryptThread: vi.fn(async (doc: unknown) => doc),
  decryptThread: vi.fn(async (doc: unknown) => doc),
}));

import { getDB } from "./client";

const mockGetDB = vi.mocked(getDB);

// Returns a fresh fake DB for each test — get throws 404 (doc not found) by default.
function makeFakeDb(overrides: Partial<{ get: (id: string) => Promise<unknown>; put: () => Promise<void> }> = {}) {
  return {
    get: vi.fn().mockRejectedValue({ status: 404 }),
    put: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  setAuthState("authenticated");
  vi.clearAllMocks();
});

// ─── importData — locked state ────────────────────────────────────────────────

describe("importData (auth guard)", () => {
  it("throws when the DB is locked", async () => {
    setAuthState("locked");
    await expect(importData("[]")).rejects.toThrow("gleaned: not authenticated");
  });
});

// ─── importData — ID / type filtering ────────────────────────────────────────

describe("importData — ID and type validation", () => {
  beforeEach(() => {
    mockGetDB.mockResolvedValue(makeFakeDb() as unknown as PouchDB.Database<AnyDoc>);
  });

  it("skips docs with invalid ID pattern (e.g. gleaned_settings)", async () => {
    const json = JSON.stringify([
      { _id: "gleaned_settings", type: "settings" },
    ]);
    const result = await importData(json);
    expect(result.skipped).toBe(1);
    expect(result.imported).toBe(0);
  });

  it("skips _design/ docs", async () => {
    const json = JSON.stringify([{ _id: "_design/idx", type: "entry" }]);
    const result = await importData(json);
    expect(result.skipped).toBe(1);
  });

  it("skips docs with unknown type", async () => {
    const json = JSON.stringify([{ _id: "entry_1234_abc", type: "unknown" }]);
    const result = await importData(json);
    expect(result.skipped).toBe(1);
  });

  it("skips docs with missing _id", async () => {
    const json = JSON.stringify([{ type: "entry" }]);
    const result = await importData(json);
    expect(result.skipped).toBe(1);
  });

  it("skips docs that are still encrypted", async () => {
    const json = JSON.stringify([
      {
        _id: "entry_1234_abcde",
        type: "entry",
        encrypted: true,
        enc: "cipher",
        content: "",
        tags: [],
        date: "2026-01-01",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const result = await importData(json);
    expect(result.skipped).toBe(1);
    expect(result.imported).toBe(0);
  });
});

// ─── importData — entry validation ───────────────────────────────────────────

describe("importData — entry field validation", () => {
  beforeEach(() => {
    mockGetDB.mockResolvedValue(makeFakeDb() as unknown as PouchDB.Database<AnyDoc>);
  });

  const validEntry = {
    _id: "entry_1000_abcde",
    type: "entry",
    content: "test content",
    tags: ["learning"],
    date: "2026-01-01",
    createdAt: "2026-01-01T10:00:00.000Z",
  };

  it("imports a valid entry", async () => {
    const json = JSON.stringify([validEntry]);
    const result = await importData(json);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it("skips entry with missing content", async () => {
    const json = JSON.stringify([{ ...validEntry, content: undefined }]);
    const result = await importData(json);
    expect(result.skipped).toBe(1);
  });

  it("skips entry with non-array tags", async () => {
    const json = JSON.stringify([{ ...validEntry, tags: "learning" }]);
    const result = await importData(json);
    expect(result.skipped).toBe(1);
  });

  it("skips entry with non-string tag element", async () => {
    const json = JSON.stringify([{ ...validEntry, tags: [1, 2] }]);
    const result = await importData(json);
    expect(result.skipped).toBe(1);
  });

  it("skips entry with invalid date format", async () => {
    const json = JSON.stringify([{ ...validEntry, date: "01-01-2026" }]);
    const result = await importData(json);
    expect(result.skipped).toBe(1);
  });

  it("skips entry with invalid createdAt", async () => {
    const json = JSON.stringify([{ ...validEntry, createdAt: "not-a-date" }]);
    const result = await importData(json);
    expect(result.skipped).toBe(1);
  });
});

// ─── importData — todo validation ─────────────────────────────────────────────

describe("importData — thread field validation", () => {
  beforeEach(() => {
    mockGetDB.mockResolvedValue(makeFakeDb() as unknown as PouchDB.Database<AnyDoc>);
  });

  const validThread = {
    _id: "thread_2000_zzzzz",
    type: "thread",
    text: "follow up on something",
    done: false,
    createdAt: "2026-01-01T10:00:00.000Z",
  };

  it("imports a valid thread", async () => {
    const json = JSON.stringify([validThread]);
    const result = await importData(json);
    expect(result.imported).toBe(1);
  });

  it("skips thread with non-boolean done", async () => {
    const json = JSON.stringify([{ ...validThread, done: "false" }]);
    const result = await importData(json);
    expect(result.skipped).toBe(1);
  });

  it("skips thread with invalid dueDate format", async () => {
    const json = JSON.stringify([{ ...validThread, dueDate: "2026/01/01" }]);
    const result = await importData(json);
    expect(result.skipped).toBe(1);
  });

  it("accepts thread with valid optional dueDate", async () => {
    const json = JSON.stringify([{ ...validThread, dueDate: "2026-12-31" }]);
    const result = await importData(json);
    expect(result.imported).toBe(1);
  });

  it("skips thread with missing text field", async () => {
    const json = JSON.stringify([{ ...validThread, text: undefined }]);
    const result = await importData(json);
    expect(result.skipped).toBe(1);
  });
});

// ─── importData — duplicate / conflict handling ───────────────────────────────

describe("importData — duplicate detection", () => {
  it("skips docs that already exist in the DB", async () => {
    const db = makeFakeDb({
      // get resolves → doc already exists
      get: vi.fn().mockResolvedValue({ _id: "entry_1000_abcde", _rev: "1-abc" }),
    });
    mockGetDB.mockResolvedValue(db as unknown as PouchDB.Database<AnyDoc>);

    const json = JSON.stringify([{
      _id: "entry_1000_abcde",
      type: "entry",
      content: "exists",
      tags: [],
      date: "2026-01-01",
      createdAt: "2026-01-01T00:00:00.000Z",
    }]);
    const result = await importData(json);
    expect(result.skipped).toBe(1);
    expect(result.imported).toBe(0);
    expect(db.put).not.toHaveBeenCalled();
  });
});

// ─── importData — array vs wrapped format ─────────────────────────────────────

describe("importData — input format variants", () => {
  beforeEach(() => {
    mockGetDB.mockResolvedValue(makeFakeDb() as unknown as PouchDB.Database<AnyDoc>);
  });

  const validEntry = {
    _id: "entry_3000_aaaaa",
    type: "entry",
    content: "wrapped",
    tags: [],
    date: "2026-01-01",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("accepts a raw array of docs", async () => {
    const json = JSON.stringify([validEntry]);
    const result = await importData(json);
    expect(result.imported).toBe(1);
  });

  it("accepts the { version, docs } export format", async () => {
    const json = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), docs: [validEntry] });
    const result = await importData(json);
    expect(result.imported).toBe(1);
  });

  it("returns 0/0 for empty docs array", async () => {
    const result = await importData("[]");
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(0);
  });
});
