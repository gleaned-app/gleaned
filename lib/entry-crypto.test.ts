import { describe, it, expect, beforeEach } from "vitest";
import { deriveKey, generateSalt, storeKey, clearKey } from "./crypto";
import { encryptEntry, decryptEntry, encryptEntryToApi, decryptEntryFromRow } from "./db/entry-crypto";
import type { Entry } from "@/types/entry";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function setupKey(): Promise<CryptoKey> {
  const key = await deriveKey("testpassword", generateSalt());
  await storeKey(key);
  return key;
}

function baseEntry(overrides: Partial<Omit<Entry, "_rev">> = {}): Omit<Entry, "_rev" | "encrypted" | "enc"> {
  return {
    _id: "entry_1234_abcde",
    type: "entry",
    content: "Spaced repetition works by revisiting knowledge at increasing intervals.",
    tags: ["learning", "memory"],
    date: "2026-01-01",
    createdAt: "2026-01-01T10:00:00.000Z",
    nextReview: "2026-01-02",
    reviewInterval: 1,
    ...overrides,
  };
}

beforeEach(() => {
  clearKey();
});

// ─── encryptEntry ─────────────────────────────────────────────────────────────

describe("encryptEntry", () => {
  it("sets encrypted=true and populates enc", async () => {
    await setupKey();
    const doc = await encryptEntry(baseEntry());
    expect(doc.encrypted).toBe(true);
    expect(typeof doc.enc).toBe("string");
    expect(doc.enc!.length).toBeGreaterThan(0);
  });

  it("blanks content and tags in the stored document", async () => {
    await setupKey();
    const doc = await encryptEntry(baseEntry({ content: "secret insight", tags: ["private"] }));
    expect(doc.content).toBe("");
    expect(doc.tags).toEqual([]);
  });

  it("does not expose source, stake, or gap as plaintext on the stored document", async () => {
    await setupKey();
    const doc = await encryptEntry(baseEntry({
      source: "Dunlosky 2013",
      stake:  "Changes how I plan study sessions",
      gap:    "Unclear how interleaving applies to procedural skills",
    }));
    expect((doc as Entry).source).toBeUndefined();
    expect((doc as Entry).stake).toBeUndefined();
    expect((doc as Entry).gap).toBeUndefined();
    // Verify the values are not in the raw enc string either
    expect(doc.enc).not.toContain("Dunlosky");
  });

  it("preserves entryType, gapStatus, lastReviewOutcome unencrypted", async () => {
    await setupKey();
    const doc = await encryptEntry(baseEntry({
      entryType: "insight",
      gapStatus: "open",
      lastReviewOutcome: "still_holds",
    }));
    const e = doc as Entry;
    expect(e.entryType).toBe("insight");
    expect(e.gapStatus).toBe("open");
    expect(e.lastReviewOutcome).toBe("still_holds");
  });

  it("omits entryType, gapStatus, lastReviewOutcome when not provided", async () => {
    await setupKey();
    const doc = await encryptEntry(baseEntry()) as Entry;
    expect(doc.entryType).toBeUndefined();
    expect(doc.gapStatus).toBeUndefined();
    expect(doc.lastReviewOutcome).toBeUndefined();
  });

  it("preserves date, createdAt, nextReview, reviewInterval", async () => {
    await setupKey();
    const input = baseEntry({ nextReview: "2026-02-15", reviewInterval: 14 });
    const doc = await encryptEntry(input) as Entry;
    expect(doc.date).toBe("2026-01-01");
    expect(doc.createdAt).toBe("2026-01-01T10:00:00.000Z");
    expect(doc.nextReview).toBe("2026-02-15");
    expect(doc.reviewInterval).toBe(14);
  });

  it("produces different ciphertext on each call (random IV)", async () => {
    await setupKey();
    const input = baseEntry({ source: "same source" });
    const doc1 = await encryptEntry(input);
    const doc2 = await encryptEntry(input);
    expect(doc1.enc).not.toBe(doc2.enc);
  });

  it("is a no-op when no key is loaded", async () => {
    const input = baseEntry({ content: "plaintext", source: "visible source" });
    const doc = await encryptEntry(input) as Entry;
    expect(doc.encrypted).toBeUndefined();
    expect(doc.enc).toBeUndefined();
    expect(doc.content).toBe("plaintext");
    expect(doc.source).toBe("visible source");
  });
});

// ─── decryptEntry ─────────────────────────────────────────────────────────────

describe("decryptEntry", () => {
  it("round-trip: content and tags survive encrypt → decrypt", async () => {
    await setupKey();
    const enc = await encryptEntry(baseEntry({ content: "original insight", tags: ["test"] }));
    const dec = await decryptEntry(enc as Entry);
    expect(dec.content).toBe("original insight");
    expect(dec.tags).toEqual(["test"]);
  });

  it("round-trip: source, stake, gap survive encrypt → decrypt", async () => {
    await setupKey();
    const input = baseEntry({
      source: "Craik & Lockhart 1972",
      stake:  "Deeper processing means I should always rewrite in my own words",
      gap:    "Is there a ceiling effect for semantic processing depth?",
    });
    const enc = await encryptEntry(input);
    const dec = await decryptEntry(enc as Entry);
    expect(dec.source).toBe("Craik & Lockhart 1972");
    expect(dec.stake).toBe("Deeper processing means I should always rewrite in my own words");
    expect(dec.gap).toBe("Is there a ceiling effect for semantic processing depth?");
  });

  it("round-trip: entryType, gapStatus, lastReviewOutcome survive", async () => {
    await setupKey();
    const input = baseEntry({ entryType: "framework", gapStatus: "resolved", lastReviewOutcome: "needs_revision" });
    const enc = await encryptEntry(input);
    const dec = await decryptEntry(enc as Entry);
    expect(dec.entryType).toBe("framework");
    expect(dec.gapStatus).toBe("resolved");
    expect(dec.lastReviewOutcome).toBe("needs_revision");
  });

  it("backward compat: old encrypted entry without v2 fields decrypts without error", async () => {
    await setupKey();
    // Simulate a pre-v2 entry: only content and tags in payload
    const legacyInput = baseEntry();
    const enc = await encryptEntry(legacyInput);
    const dec = await decryptEntry(enc as Entry);
    expect(dec.content).toBe(legacyInput.content);
    expect(dec.source).toBeUndefined();
    expect(dec.stake).toBeUndefined();
    expect(dec.gap).toBeUndefined();
  });

  it("returns entry unchanged when not encrypted", async () => {
    await setupKey();
    const plain = baseEntry({ content: "unencrypted" }) as Entry;
    const result = await decryptEntry(plain);
    expect(result).toBe(plain);
    expect(result.content).toBe("unencrypted");
  });

  it("returns entry unchanged when enc is missing (corrupted doc)", async () => {
    await setupKey();
    const corrupt = { ...baseEntry(), encrypted: true } as unknown as Entry;
    const result = await decryptEntry(corrupt);
    expect(result).toBe(corrupt);
  });

  it("returns entry unchanged when no key is loaded", async () => {
    const key = await setupKey();
    const enc = await encryptEntry(baseEntry({ content: "secret" })) as Entry;
    clearKey();
    const result = await decryptEntry(enc);
    expect(result.content).toBe("");
    // Restore key and verify ciphertext is still valid
    await storeKey(key);
    const recovered = await decryptEntry(enc);
    expect(recovered.content).toBe("secret");
  });

  it("returns entry unchanged when ciphertext is tampered (graceful fail)", async () => {
    await setupKey();
    const enc = await encryptEntry(baseEntry()) as Entry;
    const tampered: Entry = { ...enc, enc: btoa("not-valid-ciphertext") };
    const result = await decryptEntry(tampered);
    expect(result.content).toBe("");
    expect(result.encrypted).toBe(true);
  });

  it("source/stake/gap are absent (not empty string) on decrypted entry when not set", async () => {
    await setupKey();
    const enc = await encryptEntry(baseEntry());
    const dec = await decryptEntry(enc as Entry);
    // Keys must be absent entirely, not set to undefined/null — callers use `field !== undefined`
    expect("source" in dec).toBe(false);
    expect("stake"  in dec).toBe(false);
    expect("gap"    in dec).toBe(false);
  });
});

// ─── encrypt → decrypt round-trip with all v2 fields ─────────────────────────

describe("full v2 round-trip", () => {
  it("all learning model v2 fields survive a complete encrypt/decrypt cycle", async () => {
    await setupKey();
    const input = baseEntry({
      entryType: "observation",
      gapStatus: "open",
      lastReviewOutcome: "superseded",
      source: "Personal log 2026-01-01",
      stake:  "My assumption about habit formation may be wrong",
      gap:    "Need to test whether this holds under stress",
    });
    const enc = await encryptEntry(input);
    const dec = await decryptEntry(enc as Entry);

    expect(dec.entryType).toBe("observation");
    expect(dec.gapStatus).toBe("open");
    expect(dec.lastReviewOutcome).toBe("superseded");
    expect(dec.source).toBe("Personal log 2026-01-01");
    expect(dec.stake).toBe("My assumption about habit formation may be wrong");
    expect(dec.gap).toBe("Need to test whether this holds under stress");
    expect(dec.content).toBe(input.content);
    expect(dec.tags).toEqual(input.tags);
  });
});

// ─── encryptEntryToApi ────────────────────────────────────────────────────────

describe("encryptEntryToApi", () => {
  it("throws when no key is loaded", async () => {
    await expect(encryptEntryToApi(baseEntry())).rejects.toThrow("encryption key not loaded");
  });

  it("returns correct ApiEntryRow shape", async () => {
    await setupKey();
    const input = baseEntry({ nextReview: "2026-01-16", reviewInterval: 1 });
    const row = await encryptEntryToApi(input);
    expect(row.id).toBe(input._id);
    expect(row.date).toBe(input.date);
    expect(row.created_at).toBe(input.createdAt);
    expect(row.next_review).toBe("2026-01-16");
    expect(row.review_interval).toBe(1);
    expect(typeof row.data_enc).toBe("string");
    expect(row.data_enc.length).toBeGreaterThan(0);
  });

  it("sets next_review to null when nextReview is undefined", async () => {
    await setupKey();
    const row = await encryptEntryToApi(baseEntry({ nextReview: undefined }));
    expect(row.next_review).toBeNull();
  });

  it("sets review_interval to null when reviewInterval is undefined", async () => {
    await setupKey();
    const row = await encryptEntryToApi(baseEntry({ reviewInterval: undefined }));
    expect(row.review_interval).toBeNull();
  });

  it("sets updated_at to a current ISO timestamp", async () => {
    await setupKey();
    const before = new Date().toISOString();
    const row = await encryptEntryToApi(baseEntry());
    const after = new Date().toISOString();
    expect(row.updated_at >= before).toBe(true);
    expect(row.updated_at <= after).toBe(true);
  });

  it("data_enc is valid base64", async () => {
    await setupKey();
    const row = await encryptEntryToApi(baseEntry());
    expect(() => atob(row.data_enc)).not.toThrow();
  });

  it("produces different data_enc on each call (random IV)", async () => {
    await setupKey();
    const r1 = await encryptEntryToApi(baseEntry());
    const r2 = await encryptEntryToApi(baseEntry());
    expect(r1.data_enc).not.toBe(r2.data_enc);
  });
});

// ─── decryptEntryFromRow ──────────────────────────────────────────────────────

describe("decryptEntryFromRow", () => {
  async function makeRow() {
    await setupKey();
    return encryptEntryToApi(baseEntry({ nextReview: "2026-01-16", reviewInterval: 1 }));
  }

  it("throws when no key is loaded", async () => {
    const row = { id: "e1", date: "2026-01-01", created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z", next_review: null, review_interval: null, data_enc: "enc" };
    await expect(decryptEntryFromRow(row)).rejects.toThrow("encryption key not loaded");
  });

  it("round-trip: content and tags survive", async () => {
    await setupKey();
    const row = await encryptEntryToApi(baseEntry({ content: "API round-trip", tags: ["api", "test"] }));
    const entry = await decryptEntryFromRow(row);
    expect(entry.content).toBe("API round-trip");
    expect(entry.tags).toEqual(["api", "test"]);
  });

  it("round-trip: all optional encrypted fields survive", async () => {
    await setupKey();
    const row = await encryptEntryToApi(baseEntry({
      source: "Knuth 1997", stake: "changes my approach", gap: "unclear boundary",
      entryType: "insight", gapStatus: "open",
    }));
    const entry = await decryptEntryFromRow(row);
    expect(entry.source).toBe("Knuth 1997");
    expect(entry.stake).toBe("changes my approach");
    expect(entry.gap).toBe("unclear boundary");
    expect(entry.entryType).toBe("insight");
    expect(entry.gapStatus).toBe("open");
  });

  it("maps id to _id, preserves date and createdAt from row", async () => {
    const row = await makeRow();
    const entry = await decryptEntryFromRow(row);
    expect(entry._id).toBe(row.id);
    expect(entry.date).toBe(row.date);
    expect(entry.createdAt).toBe(row.created_at);
    expect(entry.type).toBe("entry");
  });

  it("omits nextReview when row.next_review is null", async () => {
    const row = { ...(await makeRow()), next_review: null };
    const entry = await decryptEntryFromRow(row);
    expect("nextReview" in entry).toBe(false);
  });

  it("omits reviewInterval when row.review_interval is null", async () => {
    const row = { ...(await makeRow()), review_interval: null };
    const entry = await decryptEntryFromRow(row);
    expect("reviewInterval" in entry).toBe(false);
  });

  it("returns empty content and tags when data_enc is corrupted", async () => {
    await setupKey();
    const row = { id: "e1", date: "2026-01-01", created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z", next_review: null, review_interval: null,
      data_enc: btoa("this is not valid aes-gcm ciphertext") };
    const entry = await decryptEntryFromRow(row);
    expect(entry.content).toBe("");
    expect(entry.tags).toEqual([]);
  });
});
