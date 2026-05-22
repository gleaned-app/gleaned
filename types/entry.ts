export interface Attachment {
  id: string;       // stable key, used as PouchDB _attachments entry
  name: string;
  mimeType: string;
  size: number;
  data?: string;    // base64 data URL; populated in memory after decryption, never persisted in enc payload
}

/** The shape of a knowledge entry — determines review prompts and scheduling behaviour. */
export type EntryType = "insight" | "technique" | "framework" | "fact" | "observation";

/** Lifecycle state of an entry's gap. */
export type GapStatus = "open" | "resolved" | "archived";

/** The learner's assessment at review time (replaces binary again/got-it in v2). */
export type ReviewOutcome = "still_holds" | "needs_revision" | "superseded";

/** A single review event stored in the entry's history for calibration tracking. */
export interface ReviewEvent {
  date: string;         // YYYY-MM-DD
  outcome: ReviewOutcome;
}

export interface Entry {
  _id: string;
  _rev?: string;
  type: "entry";
  content: string;
  tags: string[];
  date: string;
  createdAt: string;
  attachments?: Attachment[];
  // encryption — present when entry was saved with a password set
  encrypted?: boolean;
  enc?: string;
  // spaced repetition (unencrypted — queried without decryption for scheduling)
  nextReview?: string;      // YYYY-MM-DD
  reviewInterval?: number;  // days until next review
  // learning model v2 — unencrypted metadata (queryable for scheduling/filtering)
  entryType?: EntryType;
  gapStatus?: GapStatus;
  lastReviewOutcome?: ReviewOutcome;
  reviewHistory?: ReviewEvent[];  // append-only log used for calibration scoring
  // learning model v2 — encrypted content (personal; lives in EncPayload, never plaintext in DB)
  source?: string;  // where this came from
  stake?: string;   // what changes for the learner because of this knowledge
  gap?: string;     // the boundary of understanding at time of writing
}

/** Input type for creating a new entry. */
export interface EntryDraft {
  content: string;
  tags: string[];
  attachments?: Attachment[];
  entryType?: EntryType;
  source?: string;
  stake?: string;
  gap?: string;
  gapStatus?: GapStatus;
}

/**
 * Fields that can be updated on an existing entry.
 * Omitted optional fields default to the current value on the entry object
 * passed as the first argument to updateEntry — they are never silently cleared.
 */
export interface EntryUpdate {
  content: string;
  tags: string[];
  entryType?: EntryType;
  source?: string;
  stake?: string;
  gap?: string;
  gapStatus?: GapStatus;
}
