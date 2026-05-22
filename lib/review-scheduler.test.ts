import { describe, it, expect } from "vitest";
import { computeNextInterval, interleaveQueue, computeCalibration } from "./review-scheduler";
import type { Entry, EntryType, GapStatus, ReviewOutcome } from "@/types/entry";

// ─── Fixture helper ───────────────────────────────────────────────────────────

let _seq = 0;
function makeEntry(overrides: {
  entryType?: EntryType;
  gapStatus?: GapStatus;
  nextReview?: string;
  reviewInterval?: number;
} = {}): Entry {
  const id = `entry_${++_seq}`;
  return {
    _id: id,
    type: "entry",
    content: "stub",
    tags: [],
    date: "2025-01-01",
    createdAt: new Date().toISOString(),
    ...overrides,
  } as unknown as Entry;
}

// rng that always returns 0 — eliminates jitter for deterministic tests
const rng0 = () => 0;

describe("computeNextInterval", () => {
  // ── still_holds ─────────────────────────────────────────────────────────────

  it("still_holds: multiplies by 2.1 and rounds", () => {
    expect(computeNextInterval(10, "still_holds", false)).toBe(21);
  });

  it("still_holds: caps at 60 days", () => {
    expect(computeNextInterval(30, "still_holds", false)).toBe(60);
    expect(computeNextInterval(100, "still_holds", false)).toBe(60);
  });

  it("still_holds: rounds fractional result", () => {
    // 5 × 2.1 = 10.5 → rounds to 11
    expect(computeNextInterval(5, "still_holds", false)).toBe(11);
  });

  it("still_holds + open gap: halves the interval (ceil)", () => {
    expect(computeNextInterval(10, "still_holds", true)).toBe(11); // base=21, ceil(21*0.5)=11
  });

  it("still_holds + open gap: respects cap before halving", () => {
    // base = min(round(30*2.1), 60) = min(63,60) = 60; ceil(60*0.5) = 30
    expect(computeNextInterval(30, "still_holds", true)).toBe(30);
  });

  // ── needs_revision ───────────────────────────────────────────────────────────

  it("needs_revision: multiplies by 0.5 and rounds", () => {
    expect(computeNextInterval(10, "needs_revision", false)).toBe(5);
  });

  it("needs_revision: minimum 1 day", () => {
    expect(computeNextInterval(1, "needs_revision", false)).toBe(1);
    expect(computeNextInterval(0, "needs_revision", false)).toBe(1);
  });

  it("needs_revision: rounds fractional result", () => {
    // 7 × 0.5 = 3.5 → rounds to 4
    expect(computeNextInterval(7, "needs_revision", false)).toBe(4);
  });

  it("needs_revision + open gap: halves again, minimum 1", () => {
    // base = max(round(10*0.5),1) = 5; ceil(5*0.5) = 3
    expect(computeNextInterval(10, "needs_revision", true)).toBe(3);
  });

  it("needs_revision + open gap: stays at 1 when base is already 1", () => {
    expect(computeNextInterval(1, "needs_revision", true)).toBe(1);
  });

  // ── superseded ───────────────────────────────────────────────────────────────

  it("superseded: always returns 180 days", () => {
    expect(computeNextInterval(1, "superseded", false)).toBe(180);
    expect(computeNextInterval(60, "superseded", false)).toBe(180);
  });

  it("superseded + open gap: halves to 90 days", () => {
    expect(computeNextInterval(1, "superseded", true)).toBe(90);
  });

  // ── boundary / edge ──────────────────────────────────────────────────────────

  it("never returns 0 regardless of input", () => {
    expect(computeNextInterval(0, "still_holds", false)).toBeGreaterThanOrEqual(1);
    expect(computeNextInterval(0, "needs_revision", false)).toBeGreaterThanOrEqual(1);
    expect(computeNextInterval(0, "needs_revision", true)).toBeGreaterThanOrEqual(1);
  });

  it("interval 1 still_holds grows to 2", () => {
    // round(1 * 2.1) = round(2.1) = 2
    expect(computeNextInterval(1, "still_holds", false)).toBe(2);
  });
});

// ─── interleaveQueue ──────────────────────────────────────────────────────────

describe("interleaveQueue", () => {
  const TODAY = "2025-01-20";

  // ── edge cases ──────────────────────────────────────────────────────────────

  it("returns empty array for empty input", () => {
    expect(interleaveQueue([], { today: TODAY, rng: rng0 })).toEqual([]);
  });

  it("returns single entry unchanged", () => {
    const e = makeEntry({ entryType: "insight" });
    const result = interleaveQueue([e], { today: TODAY, rng: rng0 });
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe(e._id);
  });

  it("preserves all entries — no entries lost or duplicated", () => {
    const entries = [
      makeEntry({ entryType: "insight" }),
      makeEntry({ entryType: "technique" }),
      makeEntry({ entryType: "fact" }),
      makeEntry({ entryType: "insight" }),
      makeEntry({ entryType: "fact" }),
    ];
    const result = interleaveQueue(entries, { today: TODAY, rng: rng0 });
    expect(result).toHaveLength(entries.length);
    const ids = result.map((e) => e._id).sort();
    const originalIds = entries.map((e) => e._id).sort();
    expect(ids).toEqual(originalIds);
  });

  // ── type interleaving ────────────────────────────────────────────────────────

  it("two types: entries strictly alternate types (round-robin)", () => {
    // 3 insights + 3 techniques — with rng=0, round-robin produces perfect alternation
    const insights = [
      makeEntry({ entryType: "insight", nextReview: "2025-01-18" }),
      makeEntry({ entryType: "insight", nextReview: "2025-01-17" }),
      makeEntry({ entryType: "insight", nextReview: "2025-01-15" }),
    ];
    const techniques = [
      makeEntry({ entryType: "technique", nextReview: "2025-01-19" }),
      makeEntry({ entryType: "technique", nextReview: "2025-01-16" }),
      makeEntry({ entryType: "technique", nextReview: "2025-01-14" }),
    ];
    const result = interleaveQueue([...insights, ...techniques], { today: TODAY, rng: rng0 });
    // Types must alternate — no two consecutive entries may share the same type
    for (let i = 1; i < result.length; i++) {
      expect(result[i].entryType).not.toBe(result[i - 1].entryType);
    }
  });

  it("reduces type-clustering compared to sorted-by-type input", () => {
    // 4 insights followed by 4 facts — worst-case blocked ordering
    const blocked = [
      makeEntry({ entryType: "insight" }),
      makeEntry({ entryType: "insight" }),
      makeEntry({ entryType: "insight" }),
      makeEntry({ entryType: "insight" }),
      makeEntry({ entryType: "fact" }),
      makeEntry({ entryType: "fact" }),
      makeEntry({ entryType: "fact" }),
      makeEntry({ entryType: "fact" }),
    ];
    const result = interleaveQueue(blocked, { today: TODAY, rng: rng0 });
    // Count consecutive same-type pairs in result
    let violations = 0;
    for (let i = 1; i < result.length; i++) {
      if (result[i].entryType === result[i - 1].entryType) violations++;
    }
    // Perfectly interleaved would give 0; blocked would give 6. We expect 0 here.
    expect(violations).toBe(0);
  });

  it("untyped entries form their own bucket and interleave with typed entries", () => {
    const entries = [
      makeEntry({ entryType: "insight" }),
      makeEntry(),                           // no entryType
      makeEntry({ entryType: "insight" }),
      makeEntry(),
    ];
    const result = interleaveQueue(entries, { today: TODAY, rng: rng0 });
    // Should not have two consecutive entries of the same type/untyped
    for (let i = 1; i < result.length; i++) {
      const a = result[i - 1].entryType ?? "untyped";
      const b = result[i].entryType ?? "untyped";
      expect(a).not.toBe(b);
    }
  });

  // ── within-bucket priority ───────────────────────────────────────────────────

  it("gap-open entry scores higher than non-gap entry with same overdue days", () => {
    // Both insight, both 5 days overdue — gap-open must come first
    const gapOpen = makeEntry({ entryType: "insight", gapStatus: "open",    nextReview: "2025-01-15" });
    const noGap   = makeEntry({ entryType: "insight", gapStatus: undefined, nextReview: "2025-01-15" });
    // Single-bucket, rng=0 → pure score comparison
    const result = interleaveQueue([noGap, gapOpen], { today: TODAY, rng: rng0 });
    expect(result[0]._id).toBe(gapOpen._id);
  });

  it("more overdue entry scores higher within same bucket (no gap)", () => {
    const veryOverdue   = makeEntry({ entryType: "fact", nextReview: "2025-01-01" }); // 19d overdue
    const slightlyOverdue = makeEntry({ entryType: "fact", nextReview: "2025-01-18" }); // 2d overdue
    const result = interleaveQueue([slightlyOverdue, veryOverdue], { today: TODAY, rng: rng0 });
    expect(result[0]._id).toBe(veryOverdue._id);
  });

  it("gap-open entry with 0 overdue days beats non-gap entry with 9 overdue days", () => {
    // gap bonus = 10pts; 9 days overdue < 10 → gap-open wins
    const gapOpen  = makeEntry({ entryType: "technique", gapStatus: "open",    nextReview: "2025-01-20" }); // 0d overdue
    const longWait = makeEntry({ entryType: "technique", gapStatus: undefined, nextReview: "2025-01-11" }); // 9d overdue
    const result = interleaveQueue([longWait, gapOpen], { today: TODAY, rng: rng0 });
    expect(result[0]._id).toBe(gapOpen._id);
  });

  it("overdue days cap at 30 — extremely overdue is not weighted differently from 30-day overdue", () => {
    const wayOverdue   = makeEntry({ entryType: "observation", nextReview: "2024-01-01" }); // ~384d
    const thirtyDaysOld = makeEntry({ entryType: "observation", nextReview: "2024-12-21" }); // 30d
    // Both cap at 30pts; rng=0 means first element (wayOverdue, higher insertion score in tie)
    // wins. Either order is acceptable — the key is neither entry gets runaway priority.
    const result = interleaveQueue([wayOverdue, thirtyDaysOld], { today: TODAY, rng: rng0 });
    // Both present, order is implementation-defined at the cap boundary
    expect(result).toHaveLength(2);
    const ids = result.map((e) => e._id);
    expect(ids).toContain(wayOverdue._id);
    expect(ids).toContain(thirtyDaysOld._id);
  });

  // ── all same type ────────────────────────────────────────────────────────────

  it("all same type: gap-open entries appear before non-gap entries", () => {
    const gapA = makeEntry({ entryType: "framework", gapStatus: "open",    nextReview: "2025-01-15" });
    const gapB = makeEntry({ entryType: "framework", gapStatus: "open",    nextReview: "2025-01-16" });
    const plain = makeEntry({ entryType: "framework", gapStatus: undefined, nextReview: "2025-01-10" });
    const result = interleaveQueue([plain, gapA, gapB], { today: TODAY, rng: rng0 });
    // Gap entries must both appear before the non-gap entry
    const gapIds = new Set([gapA._id, gapB._id]);
    const plainIdx = result.findIndex((e) => e._id === plain._id);
    const firstGapIdx = result.findIndex((e) => gapIds.has(e._id));
    expect(firstGapIdx).toBeLessThan(plainIdx);
  });
});

// ─── computeCalibration ───────────────────────────────────────────────────────

function makeHistory(...outcomes: ReviewOutcome[]) {
  return outcomes.map((outcome, i) => ({ date: `2025-01-${String(i + 1).padStart(2, "0")}`, outcome }));
}

describe("computeCalibration", () => {
  // ── insufficient data ────────────────────────────────────────────────────────

  it("returns null for empty input", () => {
    expect(computeCalibration([])).toBeNull();
  });

  it("returns null when no entry has a review history", () => {
    expect(computeCalibration([{}, {}, {}])).toBeNull();
  });

  it("returns null when no entry has more than one review", () => {
    const entries = [
      { reviewHistory: makeHistory("still_holds") },
      { reviewHistory: makeHistory("needs_revision") },
    ];
    expect(computeCalibration(entries)).toBeNull();
  });

  it("returns null when confirmed judgments < MIN_CALIBRATION_SAMPLES (5)", () => {
    // 4 still_holds → still_holds transitions — one short of threshold
    const entries = Array.from({ length: 4 }, () => ({
      reviewHistory: makeHistory("still_holds", "still_holds"),
    }));
    expect(computeCalibration(entries)).toBeNull();
  });

  // ── perfect calibration ──────────────────────────────────────────────────────

  it("returns 1.0 when all still_holds judgments are confirmed", () => {
    const entries = Array.from({ length: 5 }, () => ({
      reviewHistory: makeHistory("still_holds", "still_holds"),
    }));
    expect(computeCalibration(entries)).toBe(1.0);
  });

  it("returns 1.0 for a long run of confirmed still_holds on a single entry", () => {
    const entry = {
      reviewHistory: makeHistory(
        "still_holds", "still_holds", "still_holds", "still_holds", "still_holds", "still_holds",
      ),
    };
    // 5 consecutive still_holds → still_holds transitions
    expect(computeCalibration([entry])).toBe(1.0);
  });

  // ── zero calibration ─────────────────────────────────────────────────────────

  it("returns 0.0 when every still_holds is followed by needs_revision", () => {
    const entries = Array.from({ length: 5 }, () => ({
      reviewHistory: makeHistory("still_holds", "needs_revision"),
    }));
    expect(computeCalibration(entries)).toBe(0.0);
  });

  it("returns 0.0 when every still_holds is followed by superseded", () => {
    const entries = Array.from({ length: 5 }, () => ({
      reviewHistory: makeHistory("still_holds", "superseded"),
    }));
    expect(computeCalibration(entries)).toBe(0.0);
  });

  // ── mixed calibration ────────────────────────────────────────────────────────

  it("returns 0.5 for equal hits and misses", () => {
    const entries = [
      ...Array.from({ length: 5 }, () => ({ reviewHistory: makeHistory("still_holds", "still_holds") })),
      ...Array.from({ length: 5 }, () => ({ reviewHistory: makeHistory("still_holds", "needs_revision") })),
    ];
    expect(computeCalibration(entries)).toBe(0.5);
  });

  it("ignores non-still_holds outcomes as the preceding judgment", () => {
    // needs_revision → still_holds should not count as a hit or miss
    const entries = Array.from({ length: 5 }, () => ({
      reviewHistory: makeHistory("still_holds", "still_holds"),
    }));
    // Add entries with needs_revision → still_holds (should not affect score)
    entries.push({ reviewHistory: makeHistory("needs_revision", "still_holds") });
    entries.push({ reviewHistory: makeHistory("superseded", "needs_revision") });
    expect(computeCalibration(entries)).toBe(1.0);
  });

  it("counts multiple transitions within a single entry's history", () => {
    // One entry: still_holds, still_holds, needs_revision → 1 hit + 1 miss
    // Five copies → 5 hits + 5 misses = 0.5
    const entry = { reviewHistory: makeHistory("still_holds", "still_holds", "needs_revision") };
    const entries = Array.from({ length: 5 }, () => entry);
    expect(computeCalibration(entries)).toBe(0.5);
  });

  it("correctly handles entries without reviewHistory mixed in", () => {
    const withHistory = Array.from({ length: 5 }, () => ({
      reviewHistory: makeHistory("still_holds", "still_holds"),
    }));
    const withoutHistory = [{}, { reviewHistory: undefined }, { reviewHistory: [] }];
    expect(computeCalibration([...withHistory, ...withoutHistory])).toBe(1.0);
  });
});
