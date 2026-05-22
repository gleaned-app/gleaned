import type { Entry } from "@/types/entry";
import { getDB, requireAuth } from "./client";
import type { AnyDoc } from "./client";
import { encryptEntry, decryptEntry } from "./entry-crypto";

export interface ConflictDoc {
  winner: Entry;
  alternatives: Entry[];
}

export async function getConflicts(): Promise<ConflictDoc[]> {
  requireAuth();
  const db = await getDB();
  const result = await db.allDocs({
    include_docs: true,
    conflicts: true,
    startkey: "entry_",
    endkey: "entry_￿",
  });

  type WithConflicts = Entry & { _conflicts?: string[] };
  const conflicted = result.rows.filter((r) => {
    const doc = r.doc as unknown as WithConflicts | undefined;
    return doc && (doc._conflicts?.length ?? 0) > 0;
  });

  return Promise.all(
    conflicted.map(async (row) => {
      const winnerRaw = row.doc as unknown as WithConflicts;
      const winner = await decryptEntry(winnerRaw as Entry) as WithConflicts;
      const alternatives = (
        await Promise.allSettled(
          (winnerRaw._conflicts ?? []).map((rev) =>
            db.get(winnerRaw._id, { rev }) as Promise<Entry>
          )
        )
      )
        .filter((r): r is PromiseFulfilledResult<Entry> => r.status === "fulfilled")
        .map((r) => r.value);
      const decryptedAlts = await Promise.all(alternatives.map(decryptEntry));
      return { winner: winner as Entry, alternatives: decryptedAlts };
    })
  );
}

export async function resolveConflict(
  id: string,
  keepRev: string,
  discardRevs: string[]
): Promise<void> {
  requireAuth();
  const db = await getDB();
  const current = (await db.get(id)) as Entry & { _attachments?: Record<string, unknown> };

  if (current._rev !== keepRev) {
    // User chose an alternative — decrypt it and overwrite the winner
    const keepRaw = (await db.get(id, { rev: keepRev })) as Entry;
    const keep = await decryptEntry(keepRaw);
    const attMeta = keep.attachments?.map(({ id: aid, name, mimeType, size }) => ({ id: aid, name, mimeType, size }));
    const base: Omit<Entry, "_rev" | "encrypted" | "enc"> = {
      _id: id, type: "entry",
      content: keep.content, tags: keep.tags,
      date: keep.date, createdAt: keep.createdAt,
      ...(attMeta?.length ? { attachments: attMeta } : {}),
      ...(keep.entryType         !== undefined ? { entryType:         keep.entryType         } : {}),
      ...(keep.gapStatus         !== undefined ? { gapStatus:         keep.gapStatus         } : {}),
      ...(keep.lastReviewOutcome !== undefined ? { lastReviewOutcome: keep.lastReviewOutcome } : {}),
      ...(keep.reviewHistory?.length           ? { reviewHistory:     keep.reviewHistory      } : {}),
      ...(keep.source !== undefined ? { source: keep.source } : {}),
      ...(keep.stake  !== undefined ? { stake:  keep.stake  } : {}),
      ...(keep.gap    !== undefined ? { gap:    keep.gap    } : {}),
    };
    const enc = await encryptEntry(base);
    await db.put({
      ...enc,
      _rev: current._rev,
      ...(current._attachments ? { _attachments: current._attachments } : {}),
    } as unknown as AnyDoc);
  }

  await Promise.allSettled(discardRevs.map((rev) => db.remove(id, rev)));
}
