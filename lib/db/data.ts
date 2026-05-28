import type { Entry } from "@/types/entry";
import type { Thread } from "@/types/thread";
import { requireAuth } from "./client";
import { encryptEntryToApi, type ApiEntryRow } from "./entry-crypto";
import { encryptThreadToApi, type ThreadApiRow } from "./thread-crypto";
import { apiFetch } from "../api-client";

export async function exportData(): Promise<string> {
  requireAuth();
  const res = await apiFetch("/api/export");
  const data = await res.json();
  return JSON.stringify(data, null, 2);
}

export async function importData(json: string): Promise<{ imported: number; skipped: number }> {
  requireAuth();
  const parsed = JSON.parse(json) as Record<string, unknown>;

  // New SQLite export format: { version, exported_at, entries: [...], threads: [...] }
  if (Array.isArray(parsed.entries) || Array.isArray(parsed.threads)) {
    const res = await apiFetch("/api/import", {
      method: "POST",
      body: JSON.stringify({
        entries: parsed.entries ?? [],
        threads: parsed.threads ?? [],
      }),
    });
    const result = await res.json() as {
      imported: { entries: number; threads: number };
      skipped:  { entries: number; threads: number };
    };
    return {
      imported: (result.imported.entries ?? 0) + (result.imported.threads ?? 0),
      skipped:  (result.skipped.entries  ?? 0) + (result.skipped.threads  ?? 0),
    };
  }

  // Old PouchDB export format: { docs: [...] } or a plain array.
  // Re-encrypt each doc under the current key and POST to /api/import.
  const rawDocs: unknown[] = Array.isArray(parsed)
    ? parsed
    : ((parsed.docs as unknown[] | undefined) ?? []);

  const VALID_ID = /^(entry|thread)_\d+_[a-z0-9]+$/;
  const DATE_RE  = /^\d{4}-\d{2}-\d{2}$/;

  const apiEntries: ApiEntryRow[] = [];
  const apiThreads: ThreadApiRow[] = [];
  let skipped = 0;

  for (const raw of rawDocs) {
    const doc = raw as Record<string, unknown>;
    const id   = (doc._id ?? doc.id) as string | undefined;
    const type = doc.type as string | undefined;
    if (!id || !type || !VALID_ID.test(id)) { skipped++; continue; }
    if (doc.encrypted === true)              { skipped++; continue; }

    if (type === "entry") {
      const content   = doc.content as unknown;
      const tags      = doc.tags    as unknown;
      const date      = doc.date    as unknown;
      const createdAt = doc.createdAt as unknown;
      if (
        typeof content   !== "string" ||
        !Array.isArray(tags) || (tags as unknown[]).some((t) => typeof t !== "string") ||
        typeof date      !== "string" || !DATE_RE.test(date) ||
        typeof createdAt !== "string" || isNaN(Date.parse(createdAt))
      ) { skipped++; continue; }

      const entry: Omit<Entry, "_rev" | "encrypted" | "enc"> = {
        _id: id, type: "entry",
        content, tags: tags as string[], date, createdAt,
        ...(typeof doc.nextReview    === "string"  ? { nextReview:    doc.nextReview    as string  } : {}),
        ...(typeof doc.reviewInterval === "number" ? { reviewInterval: doc.reviewInterval as number } : {}),
        ...(typeof doc.entryType     === "string"  ? { entryType:     doc.entryType     as string  } : {}),
        ...(typeof doc.context       === "string"  ? { context:       doc.context       as string  } : {}),
        ...(typeof doc.gapStatus     === "string"  ? { gapStatus:     doc.gapStatus     as Entry["gapStatus"]  } : {}),
        ...(typeof doc.lastReviewOutcome === "string" ? { lastReviewOutcome: doc.lastReviewOutcome as Entry["lastReviewOutcome"] } : {}),
        ...(Array.isArray(doc.reviewHistory)       ? { reviewHistory: doc.reviewHistory as Entry["reviewHistory"] } : {}),
        ...(typeof doc.stability     === "number"  ? { stability:     doc.stability     as number  } : {}),
        ...(typeof doc.difficulty    === "number"  ? { difficulty:    doc.difficulty    as number  } : {}),
        ...(typeof doc.source        === "string"  ? { source:        doc.source        as string  } : {}),
        ...(typeof doc.stake         === "string"  ? { stake:         doc.stake         as string  } : {}),
        ...(typeof doc.gap           === "string"  ? { gap:           doc.gap           as string  } : {}),
      };
      apiEntries.push(await encryptEntryToApi(entry));
      continue;
    }

    if (type === "thread") {
      const text      = doc.text      as unknown;
      const createdAt = doc.createdAt as unknown;
      if (
        typeof text      !== "string" ||
        typeof createdAt !== "string" || isNaN(Date.parse(createdAt))
      ) { skipped++; continue; }

      const thread: Omit<Thread, "_rev" | "encrypted" | "textEnc"> = {
        _id: id, type: "thread",
        text, done: (doc.done as boolean | undefined) ?? false,
        createdAt,
        ...(typeof doc.dueDate === "string" && DATE_RE.test(doc.dueDate) ? { dueDate: doc.dueDate as string } : {}),
        ...(typeof doc.color   === "string"                               ? { color:   doc.color   as string } : {}),
      };
      apiThreads.push(await encryptThreadToApi(thread));
      continue;
    }

    skipped++;
  }

  if (apiEntries.length === 0 && apiThreads.length === 0) {
    return { imported: 0, skipped };
  }

  const res = await apiFetch("/api/import", {
    method: "POST",
    body: JSON.stringify({ entries: apiEntries, threads: apiThreads }),
  });
  const result = await res.json() as {
    imported: { entries: number; threads: number };
    skipped:  { entries: number; threads: number };
  };
  return {
    imported: (result.imported.entries ?? 0) + (result.imported.threads ?? 0),
    skipped:  skipped + (result.skipped.entries ?? 0) + (result.skipped.threads ?? 0),
  };
}
