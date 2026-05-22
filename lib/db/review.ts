import type { Entry, ReviewOutcome, ReviewEvent, GapStatus } from "@/types/entry";
import { getDB, requireAuth, toLocalDateStr, isEntry, QUERY_METADATA_LIMIT, REVIEW_BACKFILL_CAP } from "./client";
import type { AnyDoc } from "./client";
import { decryptEntry } from "./entry-crypto";
import { computeNextInterval, interleaveQueue } from "../review-scheduler";

export async function getRecentEntries(limit = 50): Promise<Entry[]> {
  requireAuth();
  const db = await getDB();
  // Pass 1: fetch only metadata (no enc blob) to sort and slice
  const result = await db.find({
    selector: { type: "entry" },
    fields: ["_id", "createdAt"],
    limit: QUERY_METADATA_LIMIT,
  });
  const ids = (result.docs as unknown as Pick<Entry, "_id" | "createdAt">[])
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map((e) => e._id);
  if (ids.length === 0) return [];
  // Pass 2: single batch request for all needed docs, then decrypt
  const res = await db.allDocs({ keys: ids, include_docs: true });
  const docs = (res.rows.map((r) => ("doc" in r ? r.doc : null)) as unknown[]).filter(isEntry);
  return Promise.all(docs.map(decryptEntry));
}

export async function getReviewDue(): Promise<Entry[]> {
  requireAuth();
  const db = await getDB();
  const today = toLocalDateStr();

  // Pass 1: metadata only — filter without loading enc blobs
  const result = await db.find({
    selector: { type: "entry" },
    fields: ["_id", "date", "createdAt", "nextReview"],
    limit: QUERY_METADATA_LIMIT,
  });
  const all = result.docs as unknown as Pick<Entry, "_id" | "date" | "createdAt" | "nextReview">[];

  const scheduledIds = all
    .filter((e) => e.nextReview && e.nextReview <= today)
    .map((e) => e._id);

  // Oldest entries that have never been reviewed (pre-feature data), capped so a
  // new user is not flooded with their entire history on first use
  const backfillIds = all
    .filter((e) => !e.nextReview && e.date < today)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, REVIEW_BACKFILL_CAP)
    .map((e) => e._id);

  const ids = [...scheduledIds, ...backfillIds];
  if (ids.length === 0) return [];
  // Pass 2: single batch request, then decrypt only what we need
  const res = await db.allDocs({ keys: ids, include_docs: true });
  const docs = (res.rows.map((r) => ("doc" in r ? r.doc : null)) as unknown[]).filter(isEntry);
  const entries = await Promise.all(docs.map(decryptEntry));
  return interleaveQueue(entries);
}

export async function getReviewCount(): Promise<number> {
  requireAuth();
  const db = await getDB();
  const today = toLocalDateStr();

  const result = await db.find({
    selector: { type: "entry" },
    fields: ["_id", "nextReview", "date"],
    limit: QUERY_METADATA_LIMIT,
  });
  const all = result.docs as unknown as Pick<Entry, "_id" | "nextReview" | "date">[];

  const scheduled = all.filter((e) => e.nextReview && e.nextReview <= today).length;
  const backfill  = Math.min(all.filter((e) => !e.nextReview && e.date < today).length, REVIEW_BACKFILL_CAP);
  return scheduled + backfill;
}

// Metadata-only query — no decryption needed; reviewHistory is stored unencrypted.
export async function getCalibrationData(): Promise<Pick<Entry, "_id" | "reviewHistory">[]> {
  requireAuth();
  const db = await getDB();
  const result = await db.find({
    selector: { type: "entry" },
    fields: ["_id", "reviewHistory"],
    limit: QUERY_METADATA_LIMIT,
  });
  return result.docs as unknown as Pick<Entry, "_id" | "reviewHistory">[];
}

// Reverts a markReviewed call by restoring the scheduling fields to their
// pre-review state. Fetches the latest rev so concurrent edits are safe.
export async function undoMarkReviewed(prev: Entry): Promise<void> {
  requireAuth();
  const db = await getDB();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const latest = (await db.get(prev._id)) as unknown as Entry;
      const reverted: Entry = {
        ...latest,
        reviewInterval:    prev.reviewInterval,
        nextReview:        prev.nextReview,
        lastReviewOutcome: prev.lastReviewOutcome,
        reviewHistory:     prev.reviewHistory,
        gapStatus:         prev.gapStatus,
      };
      if (prev.reviewInterval    === undefined) delete reverted.reviewInterval;
      if (prev.nextReview        === undefined) delete reverted.nextReview;
      if (prev.lastReviewOutcome === undefined) delete reverted.lastReviewOutcome;
      if (prev.reviewHistory     === undefined) delete reverted.reviewHistory;
      if (prev.gapStatus         === undefined) delete reverted.gapStatus;
      await db.put(reverted as unknown as AnyDoc);
      return;
    } catch (err) {
      if ((err as { status?: number }).status !== 409) throw err;
    }
  }
  throw new Error("gleaned: too many conflicts undoing review");
}

// gapUpdate is set when the review also resolves/archives/keeps the open gap.
export async function markReviewed(
  entry: Entry,
  outcome: ReviewOutcome,
  gapUpdate?: GapStatus,
): Promise<Entry> {
  requireAuth();
  const db = await getDB();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const latest = (await db.get(entry._id)) as unknown as Entry & { _attachments?: Record<string, unknown> };
      const currentInterval = latest.reviewInterval ?? 1;
      const hasOpenGap = latest.gapStatus === "open";
      const newInterval = computeNextInterval(currentInterval, outcome, hasOpenGap);
      const nextReview = toLocalDateStr(new Date(Date.now() + newInterval * 86_400_000));
      const event: ReviewEvent = { date: toLocalDateStr(), outcome };
      const reviewHistory = [...(latest.reviewHistory ?? []), event];
      const updated = {
        ...latest,
        reviewInterval: newInterval,
        nextReview,
        lastReviewOutcome: outcome,
        reviewHistory,
        ...(gapUpdate !== undefined ? { gapStatus: gapUpdate } : {}),
      };
      const res = await db.put(updated as unknown as AnyDoc);
      return { ...updated, _rev: res.rev };
    } catch (err) {
      if ((err as { status?: number }).status !== 409) throw err;
    }
  }
  throw new Error("gleaned: too many conflicts updating review");
}
