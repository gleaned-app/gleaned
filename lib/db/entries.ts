import type { Entry, EntryDraft, EntryUpdate } from "@/types/entry";
import { requireAuth, toLocalDateStr, REVIEW_BACKFILL_CAP } from "./client";
import { encryptEntryToApi, decryptEntryFromRow, type ApiEntryRow } from "./entry-crypto";
import { apiFetch } from "../api-client";

// ─── Search cache ─────────────────────────────────────────────────────────────
// All decrypted entries in memory so searchEntries never re-decrypts on each
// query. Cleared on lock, updated incrementally on save/update/delete.
const cache = {
  entries: null as Entry[] | null,
  add(e: Entry)      { if (this.entries) this.entries = [e, ...this.entries]; },
  remove(id: string) { if (this.entries) this.entries = this.entries.filter(x => x._id !== id); },
  update(e: Entry)   { if (this.entries) this.entries = this.entries.map(x => x._id === e._id ? e : x); },
  clear()            { this.entries = null; },
};

export function invalidateSearchCache(): void { cache.clear(); }

async function buildSearchCache(): Promise<Entry[]> {
  const res = await apiFetch("/api/entries?from=2000-01-01&to=2099-12-31");
  const rows = await res.json() as ApiEntryRow[];
  const decrypted = await Promise.all(rows.map(decryptEntryFromRow));
  cache.entries = decrypted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return cache.entries;
}

export async function getAllEntries(): Promise<Entry[]> {
  return cache.entries ?? buildSearchCache();
}

export function updateEntryInCache(entry: Entry): void {
  cache.update(entry);
}

// ─── Entry CRUD ───────────────────────────────────────────────────────────────

export async function saveEntry(draft: EntryDraft): Promise<Entry> {
  requireAuth();
  const { content, tags, attachments, entryType, context, source, stake, gap } = draft;
  const gapStatus = draft.gapStatus ?? (gap ? "open" : undefined);
  const now = new Date();
  const tomorrow = toLocalDateStr(new Date(now.getTime() + 86_400_000));
  const entry: Omit<Entry, "_rev" | "encrypted" | "enc"> = {
    _id: `entry_${now.getTime()}_${Math.random().toString(36).slice(2, 7)}`,
    type: "entry",
    content,
    tags,
    date: toLocalDateStr(now),
    createdAt: now.toISOString(),
    nextReview: tomorrow,
    reviewInterval: 1,
    ...(attachments?.length ? { attachments } : {}),
    ...(entryType  !== undefined ? { entryType  } : {}),
    ...(context    !== undefined ? { context    } : {}),
    ...(source     !== undefined ? { source     } : {}),
    ...(stake      !== undefined ? { stake      } : {}),
    ...(gap        !== undefined ? { gap        } : {}),
    ...(gapStatus  !== undefined ? { gapStatus  } : {}),
  };
  const body = await encryptEntryToApi(entry);
  await apiFetch("/api/entries", { method: "POST", body: JSON.stringify(body) });
  const saved = entry as Entry;
  cache.add(saved);
  return saved;
}

export async function getEntriesByDate(date: string): Promise<Entry[]> {
  requireAuth();
  const res = await apiFetch(`/api/entries?date=${date}`);
  const rows = await res.json() as ApiEntryRow[];
  return Promise.all(rows.map(decryptEntryFromRow));
}

export async function getEntryMonths(): Promise<string[]> {
  requireAuth();
  const all = cache.entries ?? await buildSearchCache();
  const months = new Set<string>();
  for (const e of all) if (e.date) months.add(e.date.slice(0, 7));
  return Array.from(months).sort().reverse();
}

export async function getEntriesForMonth(year: number, month: number): Promise<Entry[]> {
  requireAuth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const prefix = `${year}-${pad(month + 1)}`;
  const res = await apiFetch(`/api/entries?from=${prefix}-01&to=${prefix}-31`);
  const rows = await res.json() as ApiEntryRow[];
  return Promise.all(rows.map(decryptEntryFromRow));
}

export async function getEntryCountsByDate(): Promise<Map<string, number>> {
  requireAuth();
  const all = cache.entries ?? await buildSearchCache();
  const counts = new Map<string, number>();
  for (const e of all) counts.set(e.date, (counts.get(e.date) ?? 0) + 1);
  return counts;
}

export async function searchEntries(query: string): Promise<Entry[]> {
  requireAuth();
  const q = query.toLowerCase();
  const all = cache.entries ?? await buildSearchCache();
  return all
    .filter((e) =>
      e.content?.toLowerCase().includes(q) ||
      e.tags?.some((t) => t.toLowerCase().includes(q)) ||
      e.source?.toLowerCase().includes(q) ||
      e.stake?.toLowerCase().includes(q) ||
      e.gap?.toLowerCase().includes(q)
    )
    .slice(0, 20);
}

export async function updateEntry(entry: Entry, update: EntryUpdate): Promise<Entry> {
  requireAuth();
  const gapStatus = update.gapStatus !== undefined
    ? update.gapStatus
    : (entry.gapStatus ?? (update.gap ? "open" : undefined));

  const merged: Omit<Entry, "_rev" | "encrypted" | "enc"> = {
    _id: entry._id,
    type: "entry",
    content: update.content,
    tags: update.tags,
    date: entry.date,
    createdAt: entry.createdAt,
    ...(entry.nextReview         !== undefined ? { nextReview:         entry.nextReview         } : {}),
    ...(entry.reviewInterval     !== undefined ? { reviewInterval:     entry.reviewInterval     } : {}),
    ...(entry.lastReviewOutcome  !== undefined ? { lastReviewOutcome:  entry.lastReviewOutcome  } : {}),
    ...(entry.reviewHistory?.length            ? { reviewHistory:      entry.reviewHistory      } : {}),
    ...(entry.stability          !== undefined ? { stability:          entry.stability          } : {}),
    ...(entry.difficulty         !== undefined ? { difficulty:         entry.difficulty         } : {}),
    ...(entry.attachments?.length              ? { attachments:        entry.attachments        } : {}),
    ...(gapStatus                !== undefined ? { gapStatus                                    } : {}),
    ...mergeField("entryType", entry.entryType, update.entryType),
    ...mergeField("context",   entry.context,   update.context),
    ...mergeField("source",    entry.source,    update.source),
    ...mergeField("stake",     entry.stake,     update.stake),
    ...mergeField("gap",       entry.gap,       update.gap),
  };

  const body = await encryptEntryToApi(merged);
  await apiFetch(`/api/entries/${entry._id}`, { method: "PUT", body: JSON.stringify(body) });
  const result = merged as Entry;
  cache.update(result);
  return result;
}

function mergeField<K extends string, V>(
  key: K,
  current: V | undefined,
  incoming: V | undefined,
): Partial<Record<K, V>> {
  const val = incoming !== undefined ? incoming : current;
  return val !== undefined ? { [key]: val } as Partial<Record<K, V>> : {};
}

export async function deleteEntry(id: string): Promise<void> {
  requireAuth();
  await apiFetch(`/api/entries/${id}`, { method: "DELETE" });
  cache.remove(id);
}

// ─── Tags & streak ────────────────────────────────────────────────────────────

export async function getAllTags(): Promise<Map<string, number>> {
  requireAuth();
  const all = cache.entries ?? await buildSearchCache();
  const counts = new Map<string, number>();
  for (const e of all) {
    for (const tag of e.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return counts;
}

export async function getEntriesByTag(tag: string): Promise<Entry[]> {
  requireAuth();
  const all = cache.entries ?? await buildSearchCache();
  return all.filter((e) => e.tags?.includes(tag));
}

export async function deleteTag(tag: string): Promise<void> {
  requireAuth();
  const all = cache.entries ?? await buildSearchCache();
  const affected = all.filter((e) => e.tags?.includes(tag));
  await Promise.all(
    affected.map(async (entry) => {
      const updated = { ...entry, tags: entry.tags.filter((t) => t !== tag) };
      const body = await encryptEntryToApi(updated as Omit<Entry, "_rev" | "encrypted" | "enc">);
      await apiFetch(`/api/entries/${entry._id}`, { method: "PUT", body: JSON.stringify(body) });
    }),
  );
  invalidateSearchCache();
}

export async function getStreakData(): Promise<{ streak: number; todayCount: number; longestStreak: number }> {
  requireAuth();
  const today = toLocalDateStr();
  const all = cache.entries ?? await buildSearchCache();
  const dates = new Set(all.map((e) => e.date));
  const todayCount = all.filter((e) => e.date === today).length;

  // Current streak — walk backwards from today (or yesterday if no entry yet today)
  let streak = 0;
  const cursor = new Date();
  if (!dates.has(today)) cursor.setDate(cursor.getDate() - 1);
  while (true) {
    const ds = toLocalDateStr(cursor);
    if (!dates.has(ds)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Longest streak ever — walk all entry dates in order
  const sorted = [...dates].sort();
  let longestStreak = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const ds of sorted) {
    const d = new Date(ds + "T00:00:00");
    if (prev) {
      const gap = Math.round((d.getTime() - prev.getTime()) / 86_400_000);
      run = gap === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    if (run > longestStreak) longestStreak = run;
    prev = d;
  }

  return { streak, todayCount, longestStreak };
}

// Kept for Phase 5 migration compatibility — no longer used in normal flow.
export { REVIEW_BACKFILL_CAP };
