import type { Entry, Attachment } from "@/types/entry";
import { loadKey, encryptText, decryptText, encryptBytes, decryptBytes, bytesToBase64 } from "../crypto";

// Only attachment metadata (no binary data) goes into the encrypted JSON payload.
// The actual binary data is stored as a separate encrypted PouchDB _attachment.
export interface AttachmentMeta {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface EncPayload {
  content: string;
  tags: string[];
  attachments?: AttachmentMeta[];
  // v2: personal content fields encrypted alongside content
  source?: string;
  stake?: string;
  gap?: string;
}

export type PouchAttachmentInline = { content_type: string; data: string };
export type PouchAttachmentStub   = { content_type: string; stub: true; digest?: string; length?: number; revpos?: number };
export type PouchAttachments = Record<string, PouchAttachmentInline | PouchAttachmentStub>;

/* @internal — exported for unit tests only */
export async function encryptEntry(
  doc: Omit<Entry, "_rev" | "encrypted" | "enc">,
): Promise<Omit<Entry, "_rev">> {
  const key = await loadKey();
  if (!key) return doc;

  const attMeta: AttachmentMeta[] | undefined = doc.attachments?.map(
    ({ id, name, mimeType, size }) => ({ id, name, mimeType, size }),
  );
  const payload: EncPayload = {
    content: doc.content,
    tags: doc.tags,
    ...(attMeta?.length ? { attachments: attMeta } : {}),
    // v2 personal content: encrypted alongside body content
    ...(doc.source !== undefined ? { source: doc.source } : {}),
    ...(doc.stake  !== undefined ? { stake:  doc.stake  } : {}),
    ...(doc.gap    !== undefined ? { gap:    doc.gap    } : {}),
  };
  const enc = await encryptText(key, JSON.stringify(payload));

  // Encrypt attachment binaries and attach them inline to the document.
  // Only attachments that carry fresh data (att.data is set) are encrypted here;
  // existing attachments without data are preserved via stubs in the put call.
  const pouchAtts: PouchAttachments = {};
  for (const att of doc.attachments ?? []) {
    if (!att.data) continue;
    const comma = att.data.indexOf(",");
    const rawBase64 = comma !== -1 ? att.data.slice(comma + 1) : att.data;
    const bytes = Uint8Array.from(atob(rawBase64), (c) => c.charCodeAt(0));
    pouchAtts[att.id] = {
      content_type: "application/octet-stream",
      data: await encryptBytes(key, bytes.buffer as ArrayBuffer),
    };
  }

  return {
    _id: doc._id, type: "entry", date: doc.date, createdAt: doc.createdAt,
    content: "", tags: [], encrypted: true, enc,
    ...(doc.nextReview        !== undefined ? { nextReview:        doc.nextReview        } : {}),
    ...(doc.reviewInterval    !== undefined ? { reviewInterval:    doc.reviewInterval    } : {}),
    // v2 unencrypted metadata — preserved in DB for scheduling/filtering without decryption
    ...(doc.entryType         !== undefined ? { entryType:         doc.entryType         } : {}),
    ...(doc.gapStatus         !== undefined ? { gapStatus:         doc.gapStatus         } : {}),
    ...(doc.lastReviewOutcome !== undefined ? { lastReviewOutcome: doc.lastReviewOutcome } : {}),
    ...(doc.reviewHistory?.length          ? { reviewHistory:     doc.reviewHistory      } : {}),
    ...(Object.keys(pouchAtts).length ? { _attachments: pouchAtts } : {}),
  } as unknown as Omit<Entry, "_rev">;
}

/* @internal — exported for unit tests only */
export async function decryptEntry(entry: Entry): Promise<Entry> {
  if (!entry.encrypted || !entry.enc) return entry;
  const key = await loadKey();
  if (!key) return entry;
  try {
    const payload = JSON.parse(await decryptText(key, entry.enc)) as EncPayload;
    const rawAtts = (entry as unknown as { _attachments?: Record<string, { data?: string }> })._attachments;

    let attachments: Attachment[] | undefined;
    if (payload.attachments?.length) {
      attachments = await Promise.all(
        payload.attachments.map(async (meta): Promise<Attachment> => {
          const encB64 = rawAtts?.[meta.id]?.data;
          if (encB64) {
            const plain = await decryptBytes(key, encB64);
            const data = `data:${meta.mimeType};base64,${bytesToBase64(new Uint8Array(plain))}`;
            return { ...meta, data };
          }
          return meta;
        }),
      );
    }

    return {
      ...entry,
      content: payload.content,
      tags: payload.tags,
      ...(attachments?.length ? { attachments } : {}),
      // v2 personal content — restored from payload; omit key entirely when absent
      // so downstream code can use `field !== undefined` safely
      ...(payload.source !== undefined ? { source: payload.source } : {}),
      ...(payload.stake  !== undefined ? { stake:  payload.stake  } : {}),
      ...(payload.gap    !== undefined ? { gap:    payload.gap    } : {}),
    };
  } catch {
    return entry;
  }
}
