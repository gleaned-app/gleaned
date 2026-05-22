export interface Attachment {
  id: string;       // stable key, used as PouchDB _attachments entry
  name: string;
  mimeType: string;
  size: number;
  data?: string;    // base64 data URL; populated in memory after decryption, never persisted in enc payload
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
  // spaced repetition
  nextReview?: string;    // YYYY-MM-DD
  reviewInterval?: number; // days until next review
}
