import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setAuthState } from "./client";
import type { Entry, EntryDraft, EntryUpdate } from "@/types/entry";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../api-client", () => ({ apiFetch: vi.fn() }));
vi.mock("./entry-crypto", () => ({
  encryptEntryToApi: vi.fn(),
  decryptEntryFromRow: vi.fn(),
}));

import { apiFetch } from "../api-client";
import { encryptEntryToApi, decryptEntryFromRow } from "./entry-crypto";
const mockApiFetch = vi.mocked(apiFetch);
const mockEncrypt  = vi.mocked(encryptEntryToApi);
const mockDecrypt  = vi.mocked(decryptEntryFromRow);

import {
  saveEntry, getEntriesByDate, searchEntries, updateEntry,
  deleteEntry, getAllTags, getEntriesByTag, getStreakData,
  getEntryCountsByDate, getAllEntries, invalidateSearchCache,
} from "./entries";

// ── Helpers ───────────────────────────────────────────────────────────────────

type FakeResponse = { ok: boolean; status: number; json: ReturnType<typeof vi.fn> };

function makeResponse(body: unknown = [], status = 200): FakeResponse {
  return { ok: status < 400, status, json: vi.fn().mockResolvedValue(body) };
}

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "entry_1",
    date: "2026-01-15",
    created_at: "2026-01-15T10:00:00.000Z",
    updated_at: "2026-01-15T10:00:00.000Z",
    next_review: "2026-01-16",
    review_interval: 1,
    data_enc: "enc",
    ...overrides,
  };
}

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    _id: "entry_1",
    type: "entry",
    content: "test content",
    tags: ["learning"],
    date: "2026-01-15",
    createdAt: "2026-01-15T10:00:00.000Z",
    nextReview: "2026-01-16",
    reviewInterval: 1,
    ...overrides,
  };
}

function makeDraft(overrides: Partial<EntryDraft> = {}): EntryDraft {
  return { content: "new insight", tags: ["test"], ...overrides };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  setAuthState("authenticated");
  invalidateSearchCache();
  mockEncrypt.mockResolvedValue(makeRow() as ReturnType<typeof makeRow>);
  mockDecrypt.mockImplementation(async (row) => makeEntry({ _id: row.id, date: row.date }));
});

// Helpers for cache population

async function populateCache(entries: Entry[]) {
  const rows = entries.map((e) => makeRow({ id: e._id, date: e.date }));
  mockApiFetch.mockResolvedValueOnce(makeResponse(rows) as unknown as Response);
  entries.forEach((e) => mockDecrypt.mockResolvedValueOnce(e));
  await getAllEntries();
}

// ── saveEntry ─────────────────────────────────────────────────────────────────

describe("saveEntry", () => {
  it("calls POST /api/entries", async () => {
    mockApiFetch.mockResolvedValue(makeResponse() as unknown as Response);
    await saveEntry(makeDraft());
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/entries",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("passes correctly structured entry to encryptEntryToApi", async () => {
    mockApiFetch.mockResolvedValue(makeResponse() as unknown as Response);
    await saveEntry(makeDraft({ content: "new insight", tags: ["test"] }));
    const [arg] = mockEncrypt.mock.calls[0];
    expect(arg.content).toBe("new insight");
    expect(arg.tags).toEqual(["test"]);
    expect(arg.type).toBe("entry");
    expect(arg._id).toMatch(/^entry_\d+_/);
  });

  it("sets nextReview to tomorrow and reviewInterval to 1", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
    mockApiFetch.mockResolvedValue(makeResponse() as unknown as Response);
    await saveEntry(makeDraft());
    const [arg] = mockEncrypt.mock.calls[0];
    expect(arg.nextReview).toBe("2026-01-16");
    expect(arg.reviewInterval).toBe(1);
    vi.useRealTimers();
  });

  it("returns the saved entry with the correct content", async () => {
    mockApiFetch.mockResolvedValue(makeResponse() as unknown as Response);
    const entry = await saveEntry(makeDraft({ content: "saved insight" }));
    expect(entry.content).toBe("saved insight");
    expect(entry.type).toBe("entry");
  });

  it("propagates optional fields: source, stake, gap, entryType", async () => {
    mockApiFetch.mockResolvedValue(makeResponse() as unknown as Response);
    await saveEntry(makeDraft({ source: "src", stake: "stk", gap: "gp", entryType: "insight" }));
    const [arg] = mockEncrypt.mock.calls[0];
    expect(arg.source).toBe("src");
    expect(arg.stake).toBe("stk");
    expect(arg.gap).toBe("gp");
    expect(arg.entryType).toBe("insight");
  });

  it("sets gapStatus to 'open' when gap is provided but gapStatus is not", async () => {
    mockApiFetch.mockResolvedValue(makeResponse() as unknown as Response);
    await saveEntry(makeDraft({ gap: "some gap" }));
    const [arg] = mockEncrypt.mock.calls[0];
    expect(arg.gapStatus).toBe("open");
  });

  it("throws when state is locked", async () => {
    setAuthState("locked");
    await expect(saveEntry(makeDraft())).rejects.toThrow("gleaned: not authenticated");
  });
});

// ── getEntriesByDate ───────────────────────────────────────────────────────────

describe("getEntriesByDate", () => {
  it("calls GET /api/entries?date=<date>", async () => {
    mockApiFetch.mockResolvedValue(makeResponse([]) as unknown as Response);
    await getEntriesByDate("2026-01-15");
    expect(mockApiFetch).toHaveBeenCalledWith("/api/entries?date=2026-01-15");
  });

  it("decrypts each row", async () => {
    mockApiFetch.mockResolvedValue(makeResponse([makeRow({ id: "e1" }), makeRow({ id: "e2" })]) as unknown as Response);
    await getEntriesByDate("2026-01-15");
    expect(mockDecrypt).toHaveBeenCalledTimes(2);
  });

  it("returns empty array for empty response", async () => {
    mockApiFetch.mockResolvedValue(makeResponse([]) as unknown as Response);
    expect(await getEntriesByDate("2026-01-15")).toHaveLength(0);
  });
});

// ── deleteEntry ───────────────────────────────────────────────────────────────

describe("deleteEntry", () => {
  it("calls DELETE /api/entries/:id", async () => {
    mockApiFetch.mockResolvedValue(makeResponse() as unknown as Response);
    await deleteEntry("entry_abc");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/entries/entry_abc",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("removes entry from cache after deletion", async () => {
    await populateCache([
      makeEntry({ _id: "entry_keep" }),
      makeEntry({ _id: "entry_del" }),
    ]);

    mockApiFetch.mockResolvedValue(makeResponse() as unknown as Response);
    await deleteEntry("entry_del");

    const remaining = await getAllEntries();
    expect(remaining.map((e) => e._id)).toContain("entry_keep");
    expect(remaining.map((e) => e._id)).not.toContain("entry_del");
  });
});

// ── updateEntry ───────────────────────────────────────────────────────────────

describe("updateEntry", () => {
  it("calls PUT /api/entries/:id", async () => {
    mockApiFetch.mockResolvedValue(makeResponse() as unknown as Response);
    await updateEntry(makeEntry({ _id: "entry_abc" }), { content: "updated", tags: [] });
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/entries/entry_abc",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("mergeField: uses incoming value when provided", async () => {
    mockApiFetch.mockResolvedValue(makeResponse() as unknown as Response);
    const entry = makeEntry({ source: "old source" });
    await updateEntry(entry, { content: "c", tags: [], source: "new source" });
    const [arg] = mockEncrypt.mock.calls[0];
    expect(arg.source).toBe("new source");
  });

  it("mergeField: keeps existing value when incoming field is absent from update", async () => {
    mockApiFetch.mockResolvedValue(makeResponse() as unknown as Response);
    const entry = makeEntry({ source: "keep this", stake: "keep too" });
    const update: EntryUpdate = { content: "c", tags: [] };
    await updateEntry(entry, update);
    const [arg] = mockEncrypt.mock.calls[0];
    expect(arg.source).toBe("keep this");
    expect(arg.stake).toBe("keep too");
  });

  it("mergeField: omits field when both current and incoming are undefined", async () => {
    mockApiFetch.mockResolvedValue(makeResponse() as unknown as Response);
    const entry = makeEntry();
    await updateEntry(entry, { content: "c", tags: [] });
    const [arg] = mockEncrypt.mock.calls[0];
    expect(arg.source).toBeUndefined();
    expect(arg.stake).toBeUndefined();
    expect(arg.gap).toBeUndefined();
  });

  it("preserves existing review fields from entry", async () => {
    mockApiFetch.mockResolvedValue(makeResponse() as unknown as Response);
    const entry = makeEntry({ reviewInterval: 14, nextReview: "2026-02-01", stability: 8, difficulty: 5 });
    await updateEntry(entry, { content: "c", tags: [] });
    const [arg] = mockEncrypt.mock.calls[0];
    expect(arg.reviewInterval).toBe(14);
    expect(arg.nextReview).toBe("2026-02-01");
    expect(arg.stability).toBe(8);
    expect(arg.difficulty).toBe(5);
  });
});

// ── searchEntries ─────────────────────────────────────────────────────────────

describe("searchEntries", () => {
  it("finds entries by content (case-insensitive)", async () => {
    await populateCache([
      makeEntry({ _id: "e1", content: "PBKDF2 key derivation techniques" }),
      makeEntry({ _id: "e2", content: "unrelated topic" }),
    ]);
    const results = await searchEntries("pbkdf2");
    expect(results.map((e) => e._id)).toContain("e1");
    expect(results.map((e) => e._id)).not.toContain("e2");
  });

  it("finds entries by tag", async () => {
    await populateCache([
      makeEntry({ _id: "e1", tags: ["crypto", "security"] }),
      makeEntry({ _id: "e2", tags: ["cooking"] }),
    ]);
    const results = await searchEntries("crypto");
    expect(results.map((e) => e._id)).toContain("e1");
    expect(results.map((e) => e._id)).not.toContain("e2");
  });

  it("finds entries by source field", async () => {
    await populateCache([
      makeEntry({ _id: "e1", source: "Knuth 1997" }),
      makeEntry({ _id: "e2" }),
    ]);
    const results = await searchEntries("knuth");
    expect(results.map((e) => e._id)).toContain("e1");
    expect(results.map((e) => e._id)).not.toContain("e2");
  });

  it("finds entries by stake field", async () => {
    await populateCache([makeEntry({ _id: "e1", stake: "Changes my study approach entirely" })]);
    const results = await searchEntries("study approach");
    expect(results.map((e) => e._id)).toContain("e1");
  });

  it("finds entries by gap field", async () => {
    await populateCache([makeEntry({ _id: "e1", gap: "unclear on boundary conditions" })]);
    const results = await searchEntries("boundary");
    expect(results.map((e) => e._id)).toContain("e1");
  });

  it("returns at most 20 results", async () => {
    const entries = Array.from({ length: 25 }, (_, i) =>
      makeEntry({ _id: `e${i}`, content: "matching query term" }),
    );
    await populateCache(entries);
    expect((await searchEntries("matching")).length).toBeLessThanOrEqual(20);
  });

  it("returns empty array when nothing matches", async () => {
    await populateCache([makeEntry({ content: "something else entirely" })]);
    expect(await searchEntries("xyzzy_no_match")).toHaveLength(0);
  });
});

// ── getAllTags ─────────────────────────────────────────────────────────────────

describe("getAllTags", () => {
  it("counts tags across all entries", async () => {
    await populateCache([
      makeEntry({ _id: "e1", tags: ["crypto", "learning"] }),
      makeEntry({ _id: "e2", tags: ["crypto", "memory"] }),
      makeEntry({ _id: "e3", tags: ["learning"] }),
    ]);
    const tags = await getAllTags();
    expect(tags.get("crypto")).toBe(2);
    expect(tags.get("learning")).toBe(2);
    expect(tags.get("memory")).toBe(1);
  });

  it("returns empty map for no entries", async () => {
    mockApiFetch.mockResolvedValueOnce(makeResponse([]) as unknown as Response);
    expect((await getAllTags()).size).toBe(0);
  });
});

// ── getEntriesByTag ───────────────────────────────────────────────────────────

describe("getEntriesByTag", () => {
  it("returns only entries with the given tag", async () => {
    await populateCache([
      makeEntry({ _id: "e1", tags: ["crypto"] }),
      makeEntry({ _id: "e2", tags: ["cooking"] }),
      makeEntry({ _id: "e3", tags: ["crypto", "security"] }),
    ]);
    const results = await getEntriesByTag("crypto");
    expect(results.map((e) => e._id)).toEqual(expect.arrayContaining(["e1", "e3"]));
    expect(results.map((e) => e._id)).not.toContain("e2");
  });
});

// ── getEntryCountsByDate ──────────────────────────────────────────────────────

describe("getEntryCountsByDate", () => {
  it("counts entries per distinct date", async () => {
    await populateCache([
      makeEntry({ _id: "e1", date: "2026-01-15" }),
      makeEntry({ _id: "e2", date: "2026-01-15" }),
      makeEntry({ _id: "e3", date: "2026-01-14" }),
    ]);
    const counts = await getEntryCountsByDate();
    expect(counts.get("2026-01-15")).toBe(2);
    expect(counts.get("2026-01-14")).toBe(1);
  });
});

// ── getStreakData ─────────────────────────────────────────────────────────────

describe("getStreakData", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns zero streak when no entries exist", async () => {
    mockApiFetch.mockResolvedValueOnce(makeResponse([]) as unknown as Response);
    const result = await getStreakData();
    expect(result.streak).toBe(0);
    expect(result.longestStreak).toBe(0);
    expect(result.todayCount).toBe(0);
  });

  it("streak = 1 when only today has entries", async () => {
    await populateCache([makeEntry({ _id: "e1", date: "2026-01-15" })]);
    const result = await getStreakData();
    expect(result.streak).toBe(1);
    expect(result.todayCount).toBe(1);
  });

  it("streak = 3 for three consecutive days ending today", async () => {
    await populateCache([
      makeEntry({ _id: "e1", date: "2026-01-13" }),
      makeEntry({ _id: "e2", date: "2026-01-14" }),
      makeEntry({ _id: "e3", date: "2026-01-15" }),
    ]);
    const result = await getStreakData();
    expect(result.streak).toBe(3);
  });

  it("streak counts from yesterday when today has no entry", async () => {
    await populateCache([
      makeEntry({ _id: "e1", date: "2026-01-13" }),
      makeEntry({ _id: "e2", date: "2026-01-14" }),
    ]);
    const result = await getStreakData();
    expect(result.streak).toBe(2);
    expect(result.todayCount).toBe(0);
  });

  it("streak resets to 1 when yesterday is missing", async () => {
    await populateCache([
      makeEntry({ _id: "e1", date: "2026-01-13" }),
      makeEntry({ _id: "e2", date: "2026-01-15" }),
    ]);
    const result = await getStreakData();
    expect(result.streak).toBe(1);
  });

  it("longestStreak tracks the historical best run", async () => {
    await populateCache([
      makeEntry({ _id: "e1", date: "2026-01-01" }),
      makeEntry({ _id: "e2", date: "2026-01-02" }),
      makeEntry({ _id: "e3", date: "2026-01-03" }),
      makeEntry({ _id: "e4", date: "2026-01-14" }),
      makeEntry({ _id: "e5", date: "2026-01-15" }),
    ]);
    const result = await getStreakData();
    expect(result.longestStreak).toBe(3);
    expect(result.streak).toBe(2);
  });

  it("multiple entries on the same date count as one day in streak", async () => {
    await populateCache([
      makeEntry({ _id: "e1", date: "2026-01-14" }),
      makeEntry({ _id: "e2", date: "2026-01-15" }),
      makeEntry({ _id: "e3", date: "2026-01-15" }),
    ]);
    const result = await getStreakData();
    expect(result.streak).toBe(2);
    expect(result.todayCount).toBe(2);
  });
});
