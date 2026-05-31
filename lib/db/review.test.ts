import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setAuthState } from "./client";
import type { Entry, ReviewOutcome } from "@/types/entry";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../api-client",      () => ({ apiFetch: vi.fn() }));
vi.mock("./entry-crypto",     () => ({ encryptEntryToApi: vi.fn(), decryptEntryFromRow: vi.fn() }));
vi.mock("./entries",          () => ({ getAllEntries: vi.fn(), updateEntryInCache: vi.fn() }));
vi.mock("../review-scheduler", () => ({
  scheduleEntry:   vi.fn(),
  interleaveQueue: vi.fn((q: Entry[]) => q),
}));

import { apiFetch } from "../api-client";
import { encryptEntryToApi, decryptEntryFromRow } from "./entry-crypto";
import { getAllEntries, updateEntryInCache } from "./entries";
import { scheduleEntry, interleaveQueue } from "../review-scheduler";
const mockApiFetch        = vi.mocked(apiFetch);
const mockEncrypt         = vi.mocked(encryptEntryToApi);
const mockDecrypt         = vi.mocked(decryptEntryFromRow);
const mockGetAllEntries   = vi.mocked(getAllEntries);
const mockUpdateCache     = vi.mocked(updateEntryInCache);
const mockScheduleEntry   = vi.mocked(scheduleEntry);
const mockInterleaveQueue = vi.mocked(interleaveQueue);

import { getRecentEntries, getReviewDue, getReviewCount, markReviewed, getCalibrationData, undoMarkReviewed } from "./review";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeResponse(body: unknown = [], status = 200) {
  return { ok: status < 400, status, json: vi.fn().mockResolvedValue(body) } as unknown as Response;
}

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "entry_1", date: "2026-01-15", created_at: "2026-01-15T10:00:00.000Z",
    updated_at: "2026-01-15T10:00:00.000Z", next_review: "2026-01-15",
    review_interval: 1, data_enc: "enc", ...overrides,
  };
}

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    _id: "entry_1", type: "entry", content: "test", tags: [],
    date: "2026-01-15", createdAt: "2026-01-15T10:00:00.000Z",
    nextReview: "2026-01-16", reviewInterval: 1, ...overrides,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  setAuthState("authenticated");
  mockEncrypt.mockResolvedValue(makeRow() as ReturnType<typeof makeRow>);
  mockDecrypt.mockImplementation(async (row) => makeEntry({ _id: row.id }));
  mockGetAllEntries.mockResolvedValue([]);
  mockScheduleEntry.mockReturnValue({ interval: 7, stability: 10, difficulty: 5 });
  mockInterleaveQueue.mockImplementation((q: Entry[]) => q);
});

// ── getRecentEntries ──────────────────────────────────────────────────────────

describe("getRecentEntries", () => {
  it("returns all entries when count is below limit", async () => {
    const entries = [makeEntry({ _id: "e1" }), makeEntry({ _id: "e2" })];
    mockGetAllEntries.mockResolvedValue(entries);
    expect(await getRecentEntries()).toHaveLength(2);
  });

  it("slices to the given limit", async () => {
    const entries = Array.from({ length: 60 }, (_, i) => makeEntry({ _id: `e${i}` }));
    mockGetAllEntries.mockResolvedValue(entries);
    expect((await getRecentEntries(10)).length).toBe(10);
  });

  it("returns entries in order from getAllEntries (cache is sorted by createdAt desc)", async () => {
    const entries = [makeEntry({ _id: "newest" }), makeEntry({ _id: "older" })];
    mockGetAllEntries.mockResolvedValue(entries);
    const result = await getRecentEntries(2);
    expect(result[0]._id).toBe("newest");
  });

  it("throws when state is locked", async () => {
    setAuthState("locked");
    await expect(getRecentEntries()).rejects.toThrow("gleaned: not authenticated");
  });
});

// ── getReviewDue ──────────────────────────────────────────────────────────────

describe("getReviewDue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls the review API with today's date", async () => {
    mockApiFetch.mockResolvedValue(makeResponse([]));
    mockGetAllEntries.mockResolvedValue([]);
    await getReviewDue();
    expect(mockApiFetch).toHaveBeenCalledWith("/api/entries/review?date=2026-01-15");
  });

  it("returns scheduled entries from the API", async () => {
    const row = makeRow({ id: "scheduled_1" });
    const entry = makeEntry({ _id: "scheduled_1", nextReview: "2026-01-15" });
    mockApiFetch.mockResolvedValue(makeResponse([row]));
    mockDecrypt.mockResolvedValueOnce(entry);
    mockGetAllEntries.mockResolvedValue([entry]);

    const result = await getReviewDue();
    expect(result.map((e) => e._id)).toContain("scheduled_1");
  });

  it("includes backfill entries (no nextReview, past date, not already scheduled)", async () => {
    const backfillEntry = makeEntry({ _id: "backfill", nextReview: undefined, date: "2026-01-10" });
    delete (backfillEntry as Partial<Entry>).nextReview;
    mockApiFetch.mockResolvedValue(makeResponse([]));
    mockGetAllEntries.mockResolvedValue([backfillEntry]);

    const result = await getReviewDue();
    expect(result.map((e) => e._id)).toContain("backfill");
  });

  it("does not include backfill entries that are already in the scheduled set", async () => {
    const entry = makeEntry({ _id: "e1", nextReview: "2026-01-15", date: "2026-01-10" });
    const noReviewEntry: Entry = { ...entry, date: "2026-01-10" };
    delete (noReviewEntry as Partial<Entry>).nextReview;

    const row = makeRow({ id: "e1" });
    mockApiFetch.mockResolvedValue(makeResponse([row]));
    mockDecrypt.mockResolvedValueOnce(entry); // decrypted scheduled entry
    mockGetAllEntries.mockResolvedValue([entry, noReviewEntry]);

    const result = await getReviewDue();
    // e1 appears only once (not duplicated as both scheduled and backfill)
    const ids = result.map((e) => e._id);
    expect(ids.filter((id) => id === "e1").length).toBe(1);
  });

  it("backfill is capped at REVIEW_BACKFILL_CAP (20)", async () => {
    const manyOld = Array.from({ length: 30 }, (_, i) => {
      const e = makeEntry({ _id: `old_${i}`, date: "2025-06-01", createdAt: `2025-06-01T0${i < 10 ? "0" : ""}${i}:00:00.000Z` });
      delete (e as Partial<Entry>).nextReview;
      return e;
    });
    mockApiFetch.mockResolvedValue(makeResponse([]));
    mockGetAllEntries.mockResolvedValue(manyOld);

    const result = await getReviewDue();
    expect(result.length).toBeLessThanOrEqual(20);
  });
});

// ── getReviewCount ────────────────────────────────────────────────────────────

describe("getReviewCount", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns sum of scheduled count and backfill count", async () => {
    const backfillEntry = makeEntry({ _id: "b1", date: "2025-12-01" });
    delete (backfillEntry as Partial<Entry>).nextReview;
    mockApiFetch.mockResolvedValue(makeResponse([makeRow(), makeRow()])); // 2 scheduled
    mockGetAllEntries.mockResolvedValue([backfillEntry]); // 1 backfill

    const count = await getReviewCount();
    expect(count).toBe(3);
  });

  it("returns 0 when nothing is due", async () => {
    mockApiFetch.mockResolvedValue(makeResponse([]));
    mockGetAllEntries.mockResolvedValue([]);
    expect(await getReviewCount()).toBe(0);
  });
});

// ── markReviewed ──────────────────────────────────────────────────────────────

describe("markReviewed", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeReviewEntry(overrides: Partial<Entry> = {}): Entry {
    return makeEntry({
      _id: "e1",
      createdAt: "2026-01-14T12:00:00.000Z",
      reviewHistory: [],
      ...overrides,
    });
  }

  it("calls scheduleEntry with the entry and outcome", async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    await markReviewed(makeReviewEntry(), "still_holds");
    expect(mockScheduleEntry).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "e1" }),
      "still_holds",
      expect.any(Number),
    );
  });

  it("computes daysSinceReview from createdAt when no review history", async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    await markReviewed(makeReviewEntry(), "still_holds");
    const [, , daysSince] = mockScheduleEntry.mock.calls[0] as [Entry, ReviewOutcome, number];
    // fake now 2026-01-15T12:00Z, createdAt 2026-01-14T12:00Z → exactly 1 day
    expect(daysSince).toBeCloseTo(1, 1);
  });

  it("uses the last review event date when history exists", async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    const entry = makeReviewEntry({
      reviewHistory: [{ date: "2026-01-10", outcome: "still_holds" }],
    });
    await markReviewed(entry, "still_holds");
    const [, , daysSince] = mockScheduleEntry.mock.calls[0] as [Entry, ReviewOutcome, number];
    // 2026-01-15T12:00Z − 2026-01-10T00:00 ≈ 5.5 days
    expect(daysSince).toBeGreaterThan(5);
    expect(daysSince).toBeLessThan(6);
  });

  it("sets nextReview to today + interval", async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    mockScheduleEntry.mockReturnValue({ interval: 7, stability: 10, difficulty: 5 });
    const result = await markReviewed(makeReviewEntry(), "still_holds");
    expect(result.nextReview).toBe("2026-01-22"); // 2026-01-15 + 7
  });

  it("appends a review event to reviewHistory", async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    const entry = makeReviewEntry({ reviewHistory: [{ date: "2026-01-10", outcome: "still_holds" }] });
    const result = await markReviewed(entry, "needs_revision");
    expect(result.reviewHistory).toHaveLength(2);
    expect(result.reviewHistory![1].outcome).toBe("needs_revision");
    expect(result.reviewHistory![1].date).toBe("2026-01-15");
  });

  it("sets lastReviewOutcome on the returned entry", async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    const result = await markReviewed(makeReviewEntry(), "superseded");
    expect(result.lastReviewOutcome).toBe("superseded");
  });

  it("sets stability and difficulty from scheduleEntry", async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    mockScheduleEntry.mockReturnValue({ interval: 7, stability: 12, difficulty: 4 });
    const result = await markReviewed(makeReviewEntry(), "still_holds");
    expect(result.stability).toBe(12);
    expect(result.difficulty).toBe(4);
  });

  it("calls PUT /api/entries/:id", async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    await markReviewed(makeReviewEntry(), "still_holds");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/entries/e1",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("calls updateEntryInCache with the updated entry", async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    await markReviewed(makeReviewEntry(), "still_holds");
    expect(mockUpdateCache).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "e1", lastReviewOutcome: "still_holds" }),
    );
  });

  it("applies gapStatus update when provided", async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    const result = await markReviewed(makeReviewEntry({ gapStatus: "open" }), "still_holds", "resolved");
    expect(result.gapStatus).toBe("resolved");
  });
});

// ── getCalibrationData ────────────────────────────────────────────────────────

describe("getCalibrationData", () => {
  it("returns _id and reviewHistory for every entry", async () => {
    const history = [{ date: "2026-01-10", outcome: "still_holds" as const }];
    mockGetAllEntries.mockResolvedValue([
      makeEntry({ _id: "e1", reviewHistory: history }),
      makeEntry({ _id: "e2" }),
    ]);
    const data = await getCalibrationData();
    expect(data).toHaveLength(2);
    expect(data[0]).toEqual({ _id: "e1", reviewHistory: history });
    expect(data[1]).toEqual({ _id: "e2", reviewHistory: undefined });
  });

  it("returns empty array when there are no entries", async () => {
    mockGetAllEntries.mockResolvedValue([]);
    expect(await getCalibrationData()).toHaveLength(0);
  });

  it("throws when state is locked", async () => {
    setAuthState("locked");
    await expect(getCalibrationData()).rejects.toThrow("gleaned: not authenticated");
  });
});

// ── undoMarkReviewed ──────────────────────────────────────────────────────────

describe("undoMarkReviewed", () => {
  it("calls PUT /api/entries/:id with the previous entry encrypted", async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    const prev = makeEntry({ _id: "e_undo", reviewInterval: 1 });
    await undoMarkReviewed(prev);
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/entries/e_undo",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(mockEncrypt).toHaveBeenCalledWith(prev);
  });

  it("calls updateEntryInCache with the previous entry", async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    const prev = makeEntry({ _id: "e_undo" });
    await undoMarkReviewed(prev);
    expect(mockUpdateCache).toHaveBeenCalledWith(prev);
  });

  it("throws when state is locked", async () => {
    setAuthState("locked");
    await expect(undoMarkReviewed(makeEntry())).rejects.toThrow("gleaned: not authenticated");
  });
});
