import { describe, it, expect } from "vitest";
import {
  scheduleEntry,
  retrievability,
  interleaveQueue,
  computeCalibration,
} from "./review-scheduler";
import type { Entry, EntryType, GapStatus, ReviewOutcome } from "@/types/entry";

// ─── Fixture helper ───────────────────────────────────────────────────────────

let _seq = 0;
function makeEntry(overrides: {
  entryType?: EntryType;
  gapStatus?: GapStatus;
  nextReview?: string;
  reviewInterval?: number;
  stability?: number;
  difficulty?: number;
  reviewHistory?: Entry["reviewHistory"];
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

// ─── retrievability ───────────────────────────────────────────────────────────

describe("retrievability", () => {
  it("returns 0.9 at exactly t = S (definition of stability)", () => {
    const S = 10;
    expect(retrievability(S, S)).toBeCloseTo(0.9, 5);
  });

  it("returns 1.0 at t = 0 (just reviewed)", () => {
    expect(retrievability(0, 10)).toBe(1);
  });

  it("decreases as time passes", () => {
    expect(retrievability(5, 10)).toBeGreaterThan(retrievability(15, 10));
  });

  it("longer stability → higher retrievability for the same elapsed days", () => {
    expect(retrievability(10, 20)).toBeGreaterThan(retrievability(10, 5));
  });
});

// ─── scheduleEntry ────────────────────────────────────────────────────────────

describe("scheduleEntry — superseded", () => {
  it("always returns interval 180", () => {
    const e = makeEntry({ stability: 10, difficulty: 5 });
    expect(scheduleEntry(e, "superseded", 10).interval).toBe(180);
  });

  it("preserves existing stability", () => {
    const e = makeEntry({ stability: 14, difficulty: 6 });
    expect(scheduleEntry(e, "superseded", 14).stability).toBe(14);
  });

  it("falls back to reviewInterval when stability is absent", () => {
    const e = makeEntry({ reviewInterval: 21 });
    expect(scheduleEntry(e, "superseded", 21).stability).toBe(21);
  });

  it("defaults stability to 1 when no prior scheduling data", () => {
    const e = makeEntry();
    expect(scheduleEntry(e, "superseded", 0).stability).toBe(1);
  });
});

describe("scheduleEntry — first review (no prior stability)", () => {
  it("still_holds initializes S from W[2] (≈ 3.17)", () => {
    const e = makeEntry();
    const { stability } = scheduleEntry(e, "still_holds", 0);
    expect(stability).toBeCloseTo(3.17395, 4);
  });

  it("needs_revision initializes S from W[0] (≈ 0.40)", () => {
    const e = makeEntry();
    const { stability } = scheduleEntry(e, "needs_revision", 0);
    expect(stability).toBeCloseTo(0.40255, 4);
  });

  it("still_holds gives interval ≥ 3 (round(3.17))", () => {
    const e = makeEntry();
    expect(scheduleEntry(e, "still_holds", 0).interval).toBe(3);
  });

  it("needs_revision gives interval 1 (minimum)", () => {
    const e = makeEntry();
    expect(scheduleEntry(e, "needs_revision", 0).interval).toBe(1);
  });

  it("initializes a reasonable difficulty in [1, 10]", () => {
    const { difficulty: dGood } = scheduleEntry(makeEntry(), "still_holds", 0);
    const { difficulty: dAgain } = scheduleEntry(makeEntry(), "needs_revision", 0);
    expect(dGood).toBeGreaterThanOrEqual(1);
    expect(dGood).toBeLessThanOrEqual(10);
    expect(dAgain).toBeGreaterThanOrEqual(1);
    expect(dAgain).toBeLessThanOrEqual(10);
  });
});

describe("scheduleEntry — subsequent reviews", () => {
  it("still_holds grows stability over time", () => {
    const e = makeEntry({ stability: 10, difficulty: 5 });
    const { stability } = scheduleEntry(e, "still_holds", 10);
    expect(stability).toBeGreaterThan(10);
  });

  it("needs_revision resets stability to a low value", () => {
    const e = makeEntry({ stability: 30, difficulty: 5 });
    const { stability } = scheduleEntry(e, "needs_revision", 30);
    expect(stability).toBeLessThan(30);
    expect(stability).toBeGreaterThan(0);
  });

  it("needs_revision increases difficulty", () => {
    const e = makeEntry({ stability: 10, difficulty: 5 });
    const { difficulty } = scheduleEntry(e, "needs_revision", 10);
    expect(difficulty).toBeGreaterThan(5);
  });

  it("still_holds with neutral rating: difficulty stays near its starting value", () => {
    // rating=3 → ΔD = 0; only mean-reversion by w7=0.0046 per step
    const e = makeEntry({ stability: 10, difficulty: 5 });
    const { difficulty } = scheduleEntry(e, "still_holds", 10);
    expect(Math.abs(difficulty - 5)).toBeLessThan(0.1); // very small shift
  });

  it("difficulty is always clamped to [1, 10]", () => {
    const hard = makeEntry({ stability: 1, difficulty: 9.8 });
    const { difficulty } = scheduleEntry(hard, "needs_revision", 1);
    expect(difficulty).toBeLessThanOrEqual(10);

    const easy = makeEntry({ stability: 30, difficulty: 1.1 });
    const { difficulty: d2 } = scheduleEntry(easy, "still_holds", 30);
    expect(d2).toBeGreaterThanOrEqual(1);
  });

  it("reviewing at t=0 does not shrink S (FSRS: no growth when R=1)", () => {
    // At t=0, R=1.0 → the recall-stability growth term is 0; S stays constant
    const e = makeEntry({ stability: 10, difficulty: 5 });
    const { stability } = scheduleEntry(e, "still_holds", 0);
    expect(stability).toBeGreaterThanOrEqual(10);
  });

  it("migration path: entry with reviewInterval but no stability uses interval as seed", () => {
    const e = makeEntry({ reviewInterval: 14 }); // old-scheduler entry, no stability field
    const { stability: sGood } = scheduleEntry(e, "still_holds", 14);
    expect(sGood).toBeGreaterThan(14); // grew from 14-day seed
  });
});

describe("scheduleEntry — gap pressure", () => {
  it("open gap halves the interval (ceil)", () => {
    const noGap = makeEntry({ stability: 20, difficulty: 5 });
    const withGap = makeEntry({ stability: 20, difficulty: 5, gapStatus: "open" });
    const r1 = scheduleEntry(noGap, "still_holds", 20);
    const r2 = scheduleEntry(withGap, "still_holds", 20);
    // r2.interval should be ceil(r1.interval / 2)
    expect(r2.interval).toBe(Math.max(Math.ceil(r1.interval / 2), 1));
  });

  it("open gap never produces interval 0", () => {
    const e = makeEntry({ stability: 0.2, difficulty: 8, gapStatus: "open" });
    expect(scheduleEntry(e, "needs_revision", 0).interval).toBeGreaterThanOrEqual(1);
  });

  it("resolved gap does not halve", () => {
    const noGap = makeEntry({ stability: 20, difficulty: 5 });
    const resolved = makeEntry({ stability: 20, difficulty: 5, gapStatus: "resolved" });
    expect(scheduleEntry(resolved, "still_holds", 20).interval)
      .toBe(scheduleEntry(noGap, "still_holds", 20).interval);
  });
});

describe("scheduleEntry — invariants", () => {
  it("interval is always ≥ 1", () => {
    const cases: [ReviewOutcome, number][] = [
      ["still_holds", 0],
      ["needs_revision", 0],
      ["superseded", 0],
      ["still_holds", 100],
      ["needs_revision", 100],
    ];
    for (const [outcome, days] of cases) {
      const e = makeEntry({ stability: 0.1, difficulty: 9, gapStatus: "open" });
      expect(scheduleEntry(e, outcome, days).interval).toBeGreaterThanOrEqual(1);
    }
  });

  it("stability is always > 0", () => {
    const e = makeEntry({ stability: 0.5, difficulty: 9 });
    expect(scheduleEntry(e, "needs_revision", 0).stability).toBeGreaterThan(0);
  });

  it("difficulty is always in [1, 10]", () => {
    for (let i = 0; i < 5; i++) {
      const e = makeEntry({ stability: Math.max(1, i), difficulty: clamp(i * 2 + 1, 1, 10) });
      const { difficulty } = scheduleEntry(e, i % 2 === 0 ? "still_holds" : "needs_revision", i);
      expect(difficulty).toBeGreaterThanOrEqual(1);
      expect(difficulty).toBeLessThanOrEqual(10);
    }
  });
});

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}

// ─── interleaveQueue ──────────────────────────────────────────────────────────

describe("interleaveQueue", () => {
  const TODAY = "2025-01-20";

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

  it("two types: entries strictly alternate types (round-robin)", () => {
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
    for (let i = 1; i < result.length; i++) {
      expect(result[i].entryType).not.toBe(result[i - 1].entryType);
    }
  });

  it("reduces type-clustering compared to sorted-by-type input", () => {
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
    let violations = 0;
    for (let i = 1; i < result.length; i++) {
      if (result[i].entryType === result[i - 1].entryType) violations++;
    }
    expect(violations).toBe(0);
  });

  it("untyped entries form their own bucket and interleave with typed entries", () => {
    const entries = [
      makeEntry({ entryType: "insight" }),
      makeEntry(),
      makeEntry({ entryType: "insight" }),
      makeEntry(),
    ];
    const result = interleaveQueue(entries, { today: TODAY, rng: rng0 });
    for (let i = 1; i < result.length; i++) {
      const a = result[i - 1].entryType ?? "untyped";
      const b = result[i].entryType ?? "untyped";
      expect(a).not.toBe(b);
    }
  });

  it("gap-open entry scores higher than non-gap entry with same overdue days", () => {
    const gapOpen = makeEntry({ entryType: "insight", gapStatus: "open",    nextReview: "2025-01-15" });
    const noGap   = makeEntry({ entryType: "insight", gapStatus: undefined, nextReview: "2025-01-15" });
    const result = interleaveQueue([noGap, gapOpen], { today: TODAY, rng: rng0 });
    expect(result[0]._id).toBe(gapOpen._id);
  });

  it("more overdue entry scores higher within same bucket (no gap)", () => {
    const veryOverdue     = makeEntry({ entryType: "fact", nextReview: "2025-01-01" });
    const slightlyOverdue = makeEntry({ entryType: "fact", nextReview: "2025-01-18" });
    const result = interleaveQueue([slightlyOverdue, veryOverdue], { today: TODAY, rng: rng0 });
    expect(result[0]._id).toBe(veryOverdue._id);
  });

  it("gap-open entry with 0 overdue days beats non-gap entry with 9 overdue days", () => {
    const gapOpen  = makeEntry({ entryType: "technique", gapStatus: "open",    nextReview: "2025-01-20" });
    const longWait = makeEntry({ entryType: "technique", gapStatus: undefined, nextReview: "2025-01-11" });
    const result = interleaveQueue([longWait, gapOpen], { today: TODAY, rng: rng0 });
    expect(result[0]._id).toBe(gapOpen._id);
  });

  it("overdue days cap at 30 — extremely overdue is not weighted differently from 30-day overdue", () => {
    const wayOverdue    = makeEntry({ entryType: "observation", nextReview: "2024-01-01" });
    const thirtyDaysOld = makeEntry({ entryType: "observation", nextReview: "2024-12-21" });
    const result = interleaveQueue([wayOverdue, thirtyDaysOld], { today: TODAY, rng: rng0 });
    expect(result).toHaveLength(2);
    const ids = result.map((e) => e._id);
    expect(ids).toContain(wayOverdue._id);
    expect(ids).toContain(thirtyDaysOld._id);
  });

  it("all same type: gap-open entries appear before non-gap entries", () => {
    const gapA = makeEntry({ entryType: "framework", gapStatus: "open",    nextReview: "2025-01-15" });
    const gapB = makeEntry({ entryType: "framework", gapStatus: "open",    nextReview: "2025-01-16" });
    const plain = makeEntry({ entryType: "framework", gapStatus: undefined, nextReview: "2025-01-10" });
    const result = interleaveQueue([plain, gapA, gapB], { today: TODAY, rng: rng0 });
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
    const entries = Array.from({ length: 4 }, () => ({
      reviewHistory: makeHistory("still_holds", "still_holds"),
    }));
    expect(computeCalibration(entries)).toBeNull();
  });

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
    expect(computeCalibration([entry])).toBe(1.0);
  });

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

  it("returns 0.5 for equal hits and misses", () => {
    const entries = [
      ...Array.from({ length: 5 }, () => ({ reviewHistory: makeHistory("still_holds", "still_holds") })),
      ...Array.from({ length: 5 }, () => ({ reviewHistory: makeHistory("still_holds", "needs_revision") })),
    ];
    expect(computeCalibration(entries)).toBe(0.5);
  });

  it("ignores non-still_holds outcomes as the preceding judgment", () => {
    const entries = Array.from({ length: 5 }, () => ({
      reviewHistory: makeHistory("still_holds", "still_holds"),
    }));
    entries.push({ reviewHistory: makeHistory("needs_revision", "still_holds") });
    entries.push({ reviewHistory: makeHistory("superseded", "needs_revision") });
    expect(computeCalibration(entries)).toBe(1.0);
  });

  it("counts multiple transitions within a single entry's history", () => {
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
