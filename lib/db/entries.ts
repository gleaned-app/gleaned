import type { Entry, EntryDraft, EntryUpdate } from "@/types/entry";
import { getDB, requireAuth, toLocalDateStr, isEntry, QUERY_METADATA_LIMIT, QUERY_DECRYPT_LIMIT } from "./client";
import type { AnyDoc } from "./client";
import { encryptEntry, decryptEntry } from "./entry-crypto";

// ─── Search cache ─────────────────────────────────────────────────────────────
// All decrypted entries in memory so searchEntries never re-decrypts on each
// query. Cleared on lock, updated incrementally on save/update/delete.
//
// Always mutate through the cache object — never assign cache.entries directly
// outside of buildSearchCache. Every write path (save/update/delete/deleteTag)
// must call the matching method so the cache stays consistent.
const cache = {
  entries: null as Entry[] | null,
  add(e: Entry)      { if (this.entries) this.entries = [e, ...this.entries]; },
  remove(id: string) { if (this.entries) this.entries = this.entries.filter(x => x._id !== id); },
  update(e: Entry)   { if (this.entries) this.entries = this.entries.map(x => x._id === e._id ? e : x); },
  clear()            { this.entries = null; },
};

export function invalidateSearchCache(): void { cache.clear(); }

async function buildSearchCache(): Promise<Entry[]> {
  const db = await getDB();
  const result = await db.find({ selector: { type: "entry" }, limit: QUERY_DECRYPT_LIMIT });
  const decrypted = await Promise.all((result.docs as unknown[]).filter(isEntry).map(decryptEntry));
  cache.entries = decrypted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return cache.entries;
}

// ─── Entry CRUD ───────────────────────────────────────────────────────────────

export async function saveEntry(draft: EntryDraft): Promise<Entry> {
  requireAuth();
  const db = await getDB();
  const { content, tags, attachments, entryType, context, source, stake, gap } = draft;
  const gapStatus = draft.gapStatus ?? (gap ? "open" : undefined);
  const now = new Date();
  const tomorrow = toLocalDateStr(new Date(now.getTime() + 86_400_000));
  const base: Omit<Entry, "_rev" | "encrypted" | "enc"> = {
    _id: `entry_${now.getTime()}_${Math.random().toString(36).slice(2, 7)}`,
    type: "entry",
    content,
    tags,
    date: toLocalDateStr(now),
    createdAt: now.toISOString(),
    nextReview: tomorrow,
    reviewInterval: 1,
    ...(attachments?.length ? { attachments } : {}),
    ...(entryType !== undefined ? { entryType } : {}),
    ...(context   !== undefined ? { context   } : {}),
    ...(source    !== undefined ? { source    } : {}),
    ...(stake     !== undefined ? { stake     } : {}),
    ...(gap       !== undefined ? { gap       } : {}),
    ...(gapStatus !== undefined ? { gapStatus } : {}),
  };
  const doc = await encryptEntry(base);
  await db.put(doc as unknown as AnyDoc);
  // Return in-memory entry with decrypted fields so the caller can display immediately
  const saved: Entry = {
    ...doc, content, tags,
    ...(attachments?.length ? { attachments } : {}),
    ...(context !== undefined ? { context } : {}),
    ...(source  !== undefined ? { source  } : {}),
    ...(stake   !== undefined ? { stake   } : {}),
    ...(gap     !== undefined ? { gap     } : {}),
  } as Entry;
  cache.add(saved);
  return saved;
}

export async function getEntriesByDate(date: string): Promise<Entry[]> {
  requireAuth();
  const db = await getDB();
  // Pass 1: fetch only metadata so we can sort without loading enc blobs
  const meta = await db.find({
    selector: { type: "entry", date },
    fields: ["_id", "createdAt"],
    sort: [{ type: "asc" }, { date: "asc" }, { createdAt: "asc" }],
  });
  const ids = (meta.docs as { _id: string; createdAt: string }[])
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((d) => d._id);
  if (ids.length === 0) return [];
  // Pass 2: batch fetch with attachment data so decryptEntry can reconstruct data URLs
  const res = await db.allDocs({ keys: ids, include_docs: true, attachments: true } as Parameters<typeof db.allDocs>[0]);
  const docs = (res.rows.map((r) => ("doc" in r ? r.doc : null)) as unknown[]).filter(isEntry);
  return Promise.all(docs.map(decryptEntry));
}

export async function getEntryMonths(): Promise<string[]> {
  requireAuth();
  const db = await getDB();
  const result = await db.find({ selector: { type: "entry" }, fields: ["date"], limit: QUERY_METADATA_LIMIT });
  const months = new Set<string>();
  for (const doc of result.docs as { date?: string }[]) {
    if (doc.date) months.add(doc.date.slice(0, 7));
  }
  return Array.from(months).sort().reverse();
}

export async function getEntriesForMonth(year: number, month: number): Promise<Entry[]> {
  requireAuth();
  const db = await getDB();
  const pad = (n: number) => String(n).padStart(2, "0");
  const prefix = `${year}-${pad(month + 1)}`;
  const result = await db.find({
    selector: { type: "entry", date: { $gte: `${prefix}-01`, $lte: `${prefix}-31` } },
    sort: [{ type: "asc" }, { date: "asc" }, { createdAt: "asc" }],
    limit: 1000,
  });
  return Promise.all((result.docs as unknown[]).filter(isEntry).map(decryptEntry));
}

export async function getEntryCountsByDate(): Promise<Map<string, number>> {
  requireAuth();
  const db = await getDB();
  const result = await db.find({ selector: { type: "entry" }, fields: ["date"] });
  const counts = new Map<string, number>();
  for (const doc of result.docs as Entry[]) {
    const d = doc.date;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
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
  const db = await getDB();
  const { content, tags } = update;
  const context   = update.context   !== undefined ? update.context   : entry.context;
  const source    = update.source    !== undefined ? update.source    : entry.source;
  const stake     = update.stake     !== undefined ? update.stake     : entry.stake;
  const gap       = update.gap       !== undefined ? update.gap       : entry.gap;
  const gapStatus = update.gapStatus !== undefined
    ? update.gapStatus
    : (entry.gapStatus ?? (gap ? "open" : undefined));
  const entryType = update.entryType !== undefined ? update.entryType : entry.entryType;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const latest = (await db.get(entry._id)) as unknown as Entry & { _attachments?: Record<string, unknown> };
      const attMeta = entry.attachments?.map(({ id, name, mimeType, size }) => ({ id, name, mimeType, size }));
      const base: Omit<Entry, "_rev" | "encrypted" | "enc"> = {
        _id: latest._id, type: "entry",
        content, tags, date: latest.date, createdAt: latest.createdAt,
        ...(latest.nextReview     !== undefined ? { nextReview:     latest.nextReview     } : {}),
        ...(latest.reviewInterval !== undefined ? { reviewInterval: latest.reviewInterval } : {}),
        ...(attMeta?.length ? { attachments: attMeta } : {}),
        ...(latest.lastReviewOutcome !== undefined ? { lastReviewOutcome: latest.lastReviewOutcome } : {}),
        ...(latest.reviewHistory?.length           ? { reviewHistory:     latest.reviewHistory      } : {}),
        ...(entryType !== undefined ? { entryType } : {}),
        ...(context   !== undefined ? { context   } : {}),
        ...(gapStatus !== undefined ? { gapStatus } : {}),
        ...(source !== undefined ? { source } : {}),
        ...(stake  !== undefined ? { stake  } : {}),
        ...(gap    !== undefined ? { gap    } : {}),
      };
      const enc = await encryptEntry(base);
      const res = await db.put({
        ...enc,
        _rev: latest._rev,
        ...(latest._attachments ? { _attachments: latest._attachments } : {}),
      } as unknown as AnyDoc);
      const updated: Entry = {
        ...enc, _rev: res.rev, content, tags,
        ...(entry.attachments?.length ? { attachments: entry.attachments } : {}),
        ...(context !== undefined ? { context } : {}),
        ...(source  !== undefined ? { source  } : {}),
        ...(stake   !== undefined ? { stake   } : {}),
        ...(gap     !== undefined ? { gap     } : {}),
      } as Entry;
      cache.update(updated);
      return updated;
    } catch (err) {
      if ((err as { status?: number }).status !== 409) throw err;
    }
  }
  throw new Error("gleaned: too many conflicts updating entry");
}

export async function deleteEntry(id: string): Promise<void> {
  requireAuth();
  const db = await getDB();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const doc = await db.get(id);
      await db.remove(doc);
      cache.remove(id);
      return;
    } catch (err) {
      if ((err as { status?: number }).status === 404) return;
      if ((err as { status?: number }).status !== 409) throw err;
    }
  }
  throw new Error("gleaned: too many conflicts deleting entry");
}

// ─── Tags & streak ────────────────────────────────────────────────────────────

export async function getAllTags(): Promise<Map<string, number>> {
  requireAuth();
  const all = cache.entries ?? await buildSearchCache();
  const counts = new Map<string, number>();
  for (const doc of all) {
    for (const tag of doc.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
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
  const db = await getDB();
  // Use the search cache so only affected entries are re-encrypted and re-put —
  // avoids decrypting the full collection when only a few docs carry the tag.
  const all = cache.entries ?? await buildSearchCache();
  const affected = all.filter((e) => e.tags?.includes(tag));
  for (const doc of affected) {
    const newTags = doc.tags.filter((t) => t !== tag);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const latest = (await db.get(doc._id)) as unknown as Entry & { _attachments?: Record<string, unknown> };
        const attMeta = doc.attachments?.map(({ id, name, mimeType, size }) => ({ id, name, mimeType, size }));
        const base: Omit<Entry, "_rev" | "encrypted" | "enc"> = {
          _id: latest._id, type: "entry",
          content: doc.content, tags: newTags,
          date: latest.date, createdAt: latest.createdAt,
          ...(latest.nextReview        !== undefined ? { nextReview:        latest.nextReview        } : {}),
          ...(latest.reviewInterval    !== undefined ? { reviewInterval:    latest.reviewInterval    } : {}),
          ...(attMeta?.length ? { attachments: attMeta } : {}),
          ...(latest.entryType         !== undefined ? { entryType:         latest.entryType         } : {}),
          ...(latest.context           !== undefined ? { context:           latest.context           } : {}),
          ...(latest.gapStatus         !== undefined ? { gapStatus:         latest.gapStatus         } : {}),
          ...(latest.lastReviewOutcome !== undefined ? { lastReviewOutcome: latest.lastReviewOutcome } : {}),
          ...(latest.reviewHistory?.length           ? { reviewHistory:     latest.reviewHistory      } : {}),
          ...(doc.source !== undefined ? { source: doc.source } : {}),
          ...(doc.stake  !== undefined ? { stake:  doc.stake  } : {}),
          ...(doc.gap    !== undefined ? { gap:    doc.gap    } : {}),
        };
        const enc = await encryptEntry(base);
        await db.put({
          ...enc,
          _rev: latest._rev,
          ...(latest._attachments ? { _attachments: latest._attachments } : {}),
        } as unknown as AnyDoc);
        break;
      } catch (err) {
        if ((err as { status?: number }).status !== 409) throw err;
      }
    }
  }
  invalidateSearchCache();
}

export async function getStreakData(): Promise<{ streak: number; todayCount: number; longestStreak: number }> {
  requireAuth();
  const db = await getDB();
  const today = toLocalDateStr();
  const result = await db.find({ selector: { type: "entry" }, fields: ["date"] });
  const dates = new Set(result.docs.map((d) => (d as Entry).date));
  const todayCount = result.docs.filter((d) => (d as Entry).date === today).length;

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
