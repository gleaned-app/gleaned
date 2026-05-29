import type { Entry, Attachment, ReviewEvent } from "@/types/entry";
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

// ─── API crypto (SQLite wire format) ─────────────────────────────────────────

// Extended payload for SQLite storage: all metadata encrypted (no plaintext
// metadata columns in SQLite — only id/date/created_at/updated_at/next_review/
// review_interval remain as plaintext columns).
export interface ApiEncPayload {
  content: string;
  tags: string[];
  attachments?: Attachment[]; // includes data URLs for binary attachments
  source?: string;
  stake?: string;
  gap?: string;
  entryType?: string;
  context?: string;
  gapStatus?: string;
  lastReviewOutcome?: string;
  reviewHistory?: ReviewEvent[];
  stability?: number;
  difficulty?: number;
}

// Wire format returned by the entries API (same shape for request body and response).
export interface ApiEntryRow {
  id: string;
  date: string;
  created_at: string;
  updated_at: string;
  next_review: string | null;
  review_interval: number | null;
  data_enc: string; // base64: encryptText output (IV || ciphertext, base64-encoded)
}

export async function encryptEntryToApi(
  entry: Omit<Entry, "_rev" | "encrypted" | "enc">,
): Promise<ApiEntryRow> {
  const key = await loadKey();
  if (!key) throw new Error("encryption key not loaded — authenticate before writing entries");
  const payload: ApiEncPayload = {
    content: entry.content,
    tags: entry.tags,
    ...(entry.attachments?.length ? { attachments: entry.attachments } : {}),
    ...(entry.source      !== undefined ? { source:      entry.source      } : {}),
    ...(entry.stake       !== undefined ? { stake:       entry.stake       } : {}),
    ...(entry.gap         !== undefined ? { gap:         entry.gap         } : {}),
    ...(entry.entryType   !== undefined ? { entryType:   entry.entryType   } : {}),
    ...(entry.context     !== undefined ? { context:     entry.context     } : {}),
    ...(entry.gapStatus   !== undefined ? { gapStatus:   entry.gapStatus   } : {}),
    ...(entry.lastReviewOutcome !== undefined ? { lastReviewOutcome: entry.lastReviewOutcome } : {}),
    ...(entry.reviewHistory?.length ? { reviewHistory: entry.reviewHistory } : {}),
    ...(entry.stability   !== undefined ? { stability:   entry.stability   } : {}),
    ...(entry.difficulty  !== undefined ? { difficulty:  entry.difficulty  } : {}),
  };
  const json = JSON.stringify(payload);
  const data_enc = await encryptText(key, json);
  return {
    id: entry._id,
    date: entry.date,
    created_at: entry.createdAt,
    updated_at: new Date().toISOString(),
    next_review: entry.nextReview ?? null,
    review_interval: entry.reviewInterval ?? null,
    data_enc,
  };
}

export async function decryptEntryFromRow(row: ApiEntryRow): Promise<Entry> {
  const key = await loadKey();
  if (!key) throw new Error("encryption key not loaded — authenticate before reading entries");
  let payload: ApiEncPayload = { content: "", tags: [] };
  try {
    const json = await decryptText(key, row.data_enc);
    payload = JSON.parse(json) as ApiEncPayload;
  } catch {}
  return {
    _id: row.id,
    type: "entry",
    content: payload.content ?? "",
    tags: payload.tags ?? [],
    date: row.date,
    createdAt: row.created_at,
    ...(row.next_review    !== null ? { nextReview:    row.next_review    } : {}),
    ...(row.review_interval !== null ? { reviewInterval: row.review_interval } : {}),
    ...(payload.attachments?.length ? { attachments: payload.attachments } : {}),
    ...(payload.source      !== undefined ? { source:      payload.source      } : {}),
    ...(payload.stake       !== undefined ? { stake:       payload.stake       } : {}),
    ...(payload.gap         !== undefined ? { gap:         payload.gap         } : {}),
    ...(payload.entryType   !== undefined ? { entryType:   payload.entryType   } : {}),
    ...(payload.context     !== undefined ? { context:     payload.context     } : {}),
    ...(payload.gapStatus   !== undefined ? { gapStatus:   payload.gapStatus as Entry["gapStatus"] } : {}),
    ...(payload.lastReviewOutcome !== undefined ? { lastReviewOutcome: payload.lastReviewOutcome as Entry["lastReviewOutcome"] } : {}),
    ...(payload.reviewHistory?.length ? { reviewHistory: payload.reviewHistory } : {}),
    ...(payload.stability   !== undefined ? { stability:   payload.stability   } : {}),
    ...(payload.difficulty  !== undefined ? { difficulty:  payload.difficulty  } : {}),
  };
}
