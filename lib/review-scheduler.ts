import type { Entry, ReviewOutcome } from "@/types/entry";

// ─── FSRS-5 constants ──────────────────────────────────────────────────────────
//
// Published default parameters from Ye et al. (2024), "A Stochastic Shortest
// Path Algorithm for Optimizing Spaced Repetition Scheduling", SIGKDD 2024.
// Hardcoded so gleaned has zero runtime dependencies and stays self-contained.
//
// prettier-ignore
const W = [
  // w0–w3: initial stability for ratings Again / Hard / Good / Easy
  0.40255, 1.18385, 3.17395, 15.69105,
  // w4–w7: difficulty init-value, scale, delta-scale, mean-reversion weight
  7.1949, 0.5345, 1.4604, 0.0046,
  // w8–w10: recall stability: exponent, S-power, R-factor
  1.54575, 0.1192, 1.01925,
  // w11–w14: forgetting stability: base, D-exponent, S-exponent, R-factor
  1.9395, 0.11, 0.29, 2.2700,
  // w15–w16: hard-penalty and easy-bonus (unused — gleaned maps to Good/Again only)
  0.2500, 2.9898,
  // w17–w18: short-term stability parameters (unused)
  0.51, 0.43,
] as const;

// At t = S days, R = 0.9.  Derivation: solve (1 + F × 1)^DECAY = 0.9 for F.
const FSRS_DECAY  = -0.5;
const FSRS_FACTOR = Math.pow(0.9, 1 / FSRS_DECAY) - 1; // ≈ 0.2346

// ─── FSRS math helpers ────────────────────────────────────────────────────────

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Probability of recall after `daysSince` days given stability S. */
export function retrievability(daysSince: number, stability: number): number {
  return Math.pow(1 + FSRS_FACTOR * daysSince / stability, FSRS_DECAY);
}

/** Initial difficulty for a fresh entry reviewed at `rating` (1=Again, 3=Good). */
function initialDifficulty(rating: 1 | 3): number {
  return clamp(W[4] - Math.exp(W[5] * (rating - 1)) + 1, 1, 10);
}

/** Initial stability for a fresh entry reviewed at `rating`. */
function initialStability(rating: 1 | 3): number {
  return rating === 1 ? W[0] : W[2];
}

/** Mean-reversion target: D₀(4) — difficulty of an "easy" item. */
const D0_EASY = W[4] - Math.exp(W[5] * 3) + 1;

/** Update difficulty after a review at `rating`. */
function updateDifficulty(D: number, rating: 1 | 3): number {
  const delta = -W[6] * (rating - 3); // 0 for Good (3), positive for Again (1)
  return clamp(W[7] * D0_EASY + (1 - W[7]) * (D + delta), 1, 10);
}

/** Stability growth after a successful recall (rating = Good). */
function updateStabilityRecall(D: number, S: number, R: number): number {
  const factor = Math.exp(W[8]) * (11 - D) * Math.pow(S, -W[9]) * (Math.exp(W[10] * (1 - R)) - 1);
  return S * (factor + 1);
}

/** Stability reset after forgetting (rating = Again). */
function updateStabilityForgetting(D: number, S: number, R: number): number {
  return W[11] * Math.pow(D, -W[12]) * (Math.pow(S + 1, W[13]) - 1) * Math.exp(W[14] * (1 - R));
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ScheduleResult {
  interval:   number;  // days until next review
  stability:  number;  // updated FSRS stability S
  difficulty: number;  // updated FSRS difficulty D
}

/**
 * Computes the next review schedule using a two-axis model:
 *
 * Axis 1 — Forgetting risk (FSRS-5):
 *   Tracks per-entry Stability S and Difficulty D.  Interval = round(S) gives
 *   90% retention.  S grows on recall; resets on forgetting.
 *
 * Axis 2 — Gap pressure (gleaned-specific):
 *   An open gap halves the interval, keeping boundary-of-understanding entries
 *   in more frequent confrontation (region-of-proximal-learning principle).
 *
 * Outcome mapping (gleaned → FSRS rating):
 *   still_holds  → rating 3 (Good)  — stable recall, S grows
 *   needs_revision → rating 1 (Again) — forgot, S resets, D increases
 *   superseded   → fixed 180 days  — not a forgetting event; archived
 *
 * Migration: entries without `stability` fall back to `reviewInterval` as the
 * initial S estimate so existing data behaves sensibly without a bulk migration.
 */
export function scheduleEntry(
  entry: Entry,
  outcome: ReviewOutcome,
  daysSinceReview: number,
): ScheduleResult {
  if (outcome === "superseded") {
    return {
      interval:   180,
      stability:  entry.stability ?? entry.reviewInterval ?? 1,
      difficulty: entry.difficulty ?? 5.0,
    };
  }

  const rating: 1 | 3 = outcome === "still_holds" ? 3 : 1;

  // Seed stability: prefer FSRS field, fall back to old reviewInterval for migration
  const prevS = entry.stability ?? entry.reviewInterval ?? null;

  let S: number;
  let D: number;

  if (prevS === null) {
    S = initialStability(rating);
    D = initialDifficulty(rating);
  } else {
    D = entry.difficulty ?? 5.0;
    const R = retrievability(Math.max(daysSinceReview, 0), Math.max(prevS, 0.1));
    if (rating === 1) {
      S = Math.max(updateStabilityForgetting(D, prevS, R), 0.1);
      D = updateDifficulty(D, 1);
    } else {
      S = Math.max(updateStabilityRecall(D, prevS, R), prevS); // S can only grow on recall
      D = updateDifficulty(D, 3);
    }
  }

  S = Math.max(S, 0.1);
  const baseInterval = Math.max(Math.round(S), 1);

  // Gap pressure: open gap halves the interval
  const interval = entry.gapStatus === "open"
    ? Math.max(Math.ceil(baseInterval * 0.5), 1)
    : baseInterval;

  return { interval, stability: S, difficulty: D };
}

// ─── Review queue ordering ────────────────────────────────────────────────────

/**
 * Reorders a review queue using interleaved practice (Rohrer & Taylor, 2007).
 *
 * Entries are grouped by type and shuffled across buckets via round-robin so
 * no two consecutive cards share the same type. Within each bucket, entries
 * are scored by: open-gap bonus (10pts) + days overdue (capped 30) + small
 * random jitter — so gap-bearing and overdue entries surface earlier while
 * preserving enough randomness to prevent rigid ordering.
 *
 * The rng and today parameters exist for deterministic testing.
 */
export function interleaveQueue(
  entries: Entry[],
  { today = currentDateStr(), rng = Math.random }: { today?: string; rng?: () => number } = {},
): Entry[] {
  if (entries.length <= 1) return [...entries];

  const buckets = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = e.entryType ?? "untyped";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(e);
  }

  for (const bucket of buckets.values()) {
    const scored = bucket.map((e) => ({ e, score: scoreEntry(e, today, rng) }));
    scored.sort((a, b) => b.score - a.score);
    bucket.splice(0, bucket.length, ...scored.map((s) => s.e));
  }

  const keys = shuffled([...buckets.keys()], rng);

  const result: Entry[] = [];
  while (result.length < entries.length) {
    for (const key of keys) {
      const bucket = buckets.get(key)!;
      if (bucket.length > 0) result.push(bucket.shift()!);
    }
  }

  return result;
}

/**
 * Computes the learner's calibration score: the fraction of "still holds"
 * judgments that were confirmed by the subsequent review rather than
 * contradicted (needs_revision / superseded).
 *
 * Returns null when fewer than MIN_CALIBRATION_SAMPLES confirmed judgments
 * exist — prevents a noisy score from early, sparse data.
 *
 * Formula: confirmed_still_holds / (confirmed_still_holds + contradicted_still_holds)
 * Range:   0.0 (always wrong) … 1.0 (always right)
 */
const MIN_CALIBRATION_SAMPLES = 5;

export function computeCalibration(
  entries: Array<Pick<Entry, "reviewHistory">>,
): number | null {
  let hits = 0;
  let misses = 0;

  for (const { reviewHistory } of entries) {
    if (!reviewHistory || reviewHistory.length < 2) continue;
    for (let i = 0; i < reviewHistory.length - 1; i++) {
      if (reviewHistory[i].outcome !== "still_holds") continue;
      const next = reviewHistory[i + 1].outcome;
      if (next === "still_holds") {
        hits++;
      } else {
        misses++;
      }
    }
  }

  const total = hits + misses;
  if (total < MIN_CALIBRATION_SAMPLES) return null;
  return hits / total;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function scoreEntry(e: Entry, today: string, rng: () => number): number {
  const msPerDay = 86_400_000;
  const daysOverdue = e.nextReview
    ? Math.max(0, (new Date(today).getTime() - new Date(e.nextReview).getTime()) / msPerDay)
    : 0;
  return Math.min(daysOverdue, 30) + (e.gapStatus === "open" ? 10 : 0) + rng() * 2;
}

function shuffled<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function currentDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
