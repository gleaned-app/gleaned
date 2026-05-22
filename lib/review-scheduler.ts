import type { ReviewOutcome } from "@/types/entry";

/**
 * Computes the next review interval in days.
 *
 * Outcomes:
 *   still_holds  — exponential growth (×2.1, max 60 days)
 *   needs_revision — partial decay (×0.5, min 1 day); stays in queue soon
 *   superseded   — pushed to 180 days; effectively archived for active review
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
