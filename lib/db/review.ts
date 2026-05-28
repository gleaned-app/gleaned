import type { Entry, ReviewOutcome, ReviewEvent, GapStatus } from "@/types/entry";
import { requireAuth, toLocalDateStr, REVIEW_BACKFILL_CAP } from "./client";
import { decryptEntryFromRow, encryptEntryToApi, type ApiEntryRow } from "./entry-crypto";
import { getAllEntries, updateEntryInCache } from "./entries";
import { apiFetch } from "../api-client";
import { scheduleEntry, interleaveQueue } from "../review-scheduler";

export async function getRecentEntries(limit = 50): Promise<Entry[]> {
  requireAuth();
  // Cache is sorted descending by createdAt — just slice.
  const all = await getAllEntries();
  return all.slice(0, limit);
}

export async function getReviewDue(): Promise<Entry[]> {
  requireAuth();
  const today = toLocalDateStr();

  const [reviewRows, all] = await Promise.all([
    apiFetch(`/api/entries/review?date=${today}`).then((r) => r.json() as Promise<ApiEntryRow[]>),
    getAllEntries(),
  ]);

  const scheduled = await Promise.all(reviewRows.map(decryptEntryFromRow));
  const scheduledIds = new Set(scheduled.map((e) => e._id));

  const backfill = all
    .filter((e) => !e.nextReview && e.date < today && !scheduledIds.has(e._id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, REVIEW_BACKFILL_CAP);

  return interleaveQueue([...scheduled, ...backfill]);
}

export async function getReviewCount(): Promise<number> {
  requireAuth();
  const today = toLocalDateStr();
  const [reviewRows, all] = await Promise.all([
    apiFetch(`/api/entries/review?date=${today}`).then((r) => r.json() as Promise<unknown[]>),
    getAllEntries(),
  ]);
  const scheduled = reviewRows.length;
  const backfill = Math.min(
    all.filter((e) => !e.nextReview && e.date < today).length,
    REVIEW_BACKFILL_CAP,
  );
  return scheduled + backfill;
}

// reviewHistory is now inside data_enc — requires full cache to be populated.
export async function getCalibrationData(): Promise<Pick<Entry, "_id" | "reviewHistory">[]> {
  requireAuth();
  const all = await getAllEntries();
  return all.map((e) => ({ _id: e._id, reviewHistory: e.reviewHistory }));
}

export async function undoMarkReviewed(prev: Entry): Promise<void> {
  requireAuth();
  const body = await encryptEntryToApi(prev as Omit<Entry, "_rev" | "encrypted" | "enc">);
  await apiFetch(`/api/entries/${prev._id}`, { method: "PUT", body: JSON.stringify(body) });
  updateEntryInCache(prev);
}

export async function markReviewed(
  entry: Entry,
  outcome: ReviewOutcome,
  gapUpdate?: GapStatus,
): Promise<Entry> {
  requireAuth();

  const lastEvent = (entry.reviewHistory ?? []).at(-1);
  const prevDate = lastEvent
    ? new Date(`${lastEvent.date}T00:00:00`)
    : new Date(entry.createdAt);
  const daysSinceReview = (Date.now() - prevDate.getTime()) / 86_400_000;

  const { interval: newInterval, stability, difficulty } = scheduleEntry(
    entry,
    outcome,
    daysSinceReview,
  );

  const nextReview = toLocalDateStr(new Date(Date.now() + newInterval * 86_400_000));
  const event: ReviewEvent = { date: toLocalDateStr(), outcome };
  const reviewHistory = [...(entry.reviewHistory ?? []), event];

  const updated: Omit<Entry, "_rev" | "encrypted" | "enc"> = {
    ...entry,
    reviewInterval: newInterval,
    nextReview,
    lastReviewOutcome: outcome,
    reviewHistory,
    stability,
    difficulty,
    ...(gapUpdate !== undefined ? { gapStatus: gapUpdate } : {}),
  };

  const body = await encryptEntryToApi(updated);
  await apiFetch(`/api/entries/${entry._id}`, { method: "PUT", body: JSON.stringify(body) });
  const result = updated as Entry;
  updateEntryInCache(result);
  return result;
}
