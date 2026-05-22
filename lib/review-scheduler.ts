import type { Entry, ReviewOutcome } from "@/types/entry";

/**
 * Computes the next review interval in days.
 *
 * Outcomes:
 *   still_holds    — exponential growth (×2.1, max 60 days)
 *   needs_revision — partial decay (×0.5, min 1 day); stays in queue soon
 *   superseded     — pushed to 180 days; effectively archived for active review
 *
 * Gap pressure (region-of-proximal-learning principle):
 * An open gap halves the interval. Entries at the boundary of understanding
 * need more frequent confrontation than settled knowledge.
 */
export function computeNextInterval(
  currentInterval: number,
  outcome: ReviewOutcome,
  hasOpenGap: boolean,
): number {
  let base: number;
  if (outcome === "still_holds") {
    base = Math.max(Math.min(Math.round(currentInterval * 2.1), 60), 1);
  } else if (outcome === "needs_revision") {
    base = Math.max(Math.round(currentInterval * 0.5), 1);
  } else {
    // superseded — push far out; not deleted in case understanding later returns
    base = 180;
  }
  return hasOpenGap ? Math.max(Math.ceil(base * 0.5), 1) : base;
}

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

  // Group by entry type; untyped entries form their own bucket
  const buckets = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = e.entryType ?? "untyped";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(e);
  }

  // Pre-compute scores then sort descending so the highest-priority entry
  // in each bucket is at index 0 (to be shifted out first)
  for (const bucket of buckets.values()) {
    const scored = bucket.map((e) => ({ e, score: scoreEntry(e, today, rng) }));
    scored.sort((a, b) => b.score - a.score);
    bucket.splice(0, bucket.length, ...scored.map((s) => s.e));
  }

  // Shuffle the bucket traversal order so different types lead across sessions
  const keys = shuffled([...buckets.keys()], rng);

  // Round-robin: one entry per bucket per pass — guarantees type interleaving
  const result: Entry[] = [];
  while (result.length < entries.length) {
    for (const key of keys) {
      const bucket = buckets.get(key)!;
      if (bucket.length > 0) result.push(bucket.shift()!);
    }
  }

  return result;
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
