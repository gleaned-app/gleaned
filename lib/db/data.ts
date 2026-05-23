import type { Entry, Attachment } from "@/types/entry";
import type { Thread } from "@/types/thread";
import { getDB, requireAuth } from "./client";
import type { AnyDoc } from "./client";
import { encryptEntry, decryptEntry } from "./entry-crypto";
import { encryptThread, decryptThread } from "./thread-crypto";

export async function exportData(): Promise<string> {
  requireAuth();
  const db = await getDB();
  // Load with attachments:true so decryptEntry can reconstruct attachment data URLs.
  const result = await db.allDocs({ include_docs: true, attachments: true } as Parameters<typeof db.allDocs>[0]);
  // Decrypt entries so the export is portable across devices and passwords.
  const docs = await Promise.all(
    result.rows
      .filter((r) => r.doc && (r.doc.type === "entry" || r.doc.type === "thread"))
      .map(async (r) => {
        const raw = r.doc as AnyDoc & { _rev?: string; encrypted?: boolean; enc?: string; textEnc?: string };
        const { _rev: _, _attachments: __, ...doc } = raw as typeof raw & { _attachments?: unknown };
        if (doc.type === "entry" && doc.encrypted) {
          const decrypted = await decryptEntry(doc as Entry);
          const { encrypted: _e, enc: _f, ...plain } = decrypted as Entry & { encrypted?: boolean; enc?: string };
          return plain;
        }
        if (doc.type === "thread" && doc.encrypted) {
          const decrypted = await decryptThread(doc as Thread);
          const { encrypted: _e, textEnc: _f, ...plain } = decrypted as Thread & { encrypted?: boolean; textEnc?: string };
          return plain;
        }
        return doc;
      })
  );
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), docs }, null, 2);
}

export async function importData(json: string): Promise<{ imported: number; skipped: number }> {
  requireAuth();
  const db = await getDB();
  const parsed = JSON.parse(json) as { docs?: unknown[] } | unknown[];
  const rawDocs: unknown[] = Array.isArray(parsed) ? parsed : ((parsed as { docs?: unknown[] }).docs ?? []);

  let imported = 0;
  let skipped = 0;

  // Allow only IDs that match gleaned's own generation pattern.
  // Blocks _design/*, _local/*, gleaned_settings, and any other internal docs.
  const VALID_ID = /^(entry|thread)_\d+_[a-z0-9]+$/;
  const IMPORTABLE_TYPES = new Set(["entry", "thread"]);
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  for (const raw of rawDocs) {
    const doc = raw as Record<string, unknown>;
    const id = doc._id as string;
    const type = doc.type as string;
    if (!id || !type || !IMPORTABLE_TYPES.has(type) || !VALID_ID.test(id)) { skipped++; continue; }

    // Skip entries that are still encrypted — they cannot be decrypted without the
    // original password and would import as blank entries.
    if (doc.encrypted === true) { skipped++; continue; }

    if (type === "entry") {
      const valid =
        typeof doc.content === "string" &&
        Array.isArray(doc.tags) &&
        (doc.tags as unknown[]).every((t) => typeof t === "string") &&
        typeof doc.date === "string" && DATE_RE.test(doc.date) &&
        typeof doc.createdAt === "string" && !isNaN(Date.parse(doc.createdAt as string));
      if (!valid) { skipped++; continue; }
    }

    if (type === "thread") {
      const valid =
        typeof doc.text === "string" &&
        typeof doc.done === "boolean" &&
        typeof doc.createdAt === "string" && !isNaN(Date.parse(doc.createdAt as string)) &&
        (doc.dueDate === undefined ||
          (typeof doc.dueDate === "string" && DATE_RE.test(doc.dueDate)));
      if (!valid) { skipped++; continue; }
    }

    try {
      await db.get(id);
      skipped++;
    } catch (e) {
      if ((e as { status?: number }).status === 404) {
        if (type === "entry") {
          // Re-encrypt under the current key so imported entries are not stored
          // in plaintext alongside encrypted native entries.
          const mutable = { ...(doc as Record<string, unknown>) };
          delete mutable._rev;
          delete mutable.encrypted;
          delete mutable.enc;
          // Backfill missing attachment IDs from exports created before migration
          if (Array.isArray(mutable.attachments)) {
            mutable.attachments = (mutable.attachments as Attachment[]).map(
              (att) => att.id ? att : { ...att, id: Math.random().toString(36).slice(2, 10) },
            );
          }
          const toStore = await encryptEntry(mutable as Omit<Entry, "_rev" | "encrypted" | "enc">);
          await db.put(toStore as unknown as AnyDoc);
        } else {
          const mutable = { ...(doc as Record<string, unknown>) };
          delete mutable._rev;
          delete mutable.encrypted;
          delete mutable.textEnc;
          const toStore = await encryptThread(mutable as Omit<Thread, "_rev" | "encrypted" | "textEnc">);
          await db.put(toStore as unknown as AnyDoc);
        }
        imported++;
      } else {
        skipped++;
      }
    }
  }

  return { imported, skipped };
}
