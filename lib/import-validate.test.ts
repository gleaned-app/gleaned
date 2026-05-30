import { describe, it, expect } from "vitest";
import {
  isIsoDate,
  isIsoTimestamp,
  isValidDataEnc,
  isValidEntry,
  isValidThread,
} from "./import-validate";

// Minimum valid AES-GCM base64: 30 zero bytes → 40 base64 chars (all 'A's)
const VALID_ENC = "A".repeat(36) + "AAAA"; // 40 chars, valid base64 group
// Realistic ciphertext length (IV 12 B + some JSON + auth tag 16 B ≈ 80+ chars)
const REAL_ENC = "dGhpcyBpcyBhIHJlYWxpc3RpYyBjaXBoZXJ0ZXh0IGJhc2U2NCBibG9i"; // 60 chars

const VALID_UUID = "12345678-1234-1234-1234-123456789abc";
const VALID_DATE = "2024-01-15";
const VALID_TS   = "2024-01-15T10:30:00.000Z";

// ─── isIsoDate ────────────────────────────────────────────────────────────────

describe("isIsoDate", () => {
  it("accepts a valid YYYY-MM-DD date", () => {
    expect(isIsoDate("2024-01-15")).toBe(true);
  });

  it("accepts January 1st", () => {
    expect(isIsoDate("2024-01-01")).toBe(true);
  });

  it("accepts December 31st", () => {
    expect(isIsoDate("2024-12-31")).toBe(true);
  });

  it("accepts Feb 29 on a leap year", () => {
    expect(isIsoDate("2024-02-29")).toBe(true);
  });

  it("rejects Feb 29 on a non-leap year", () => {
    expect(isIsoDate("2023-02-29")).toBe(false);
  });

  it("rejects month 13", () => {
    expect(isIsoDate("2024-13-01")).toBe(false);
  });

  it("rejects month 00", () => {
    expect(isIsoDate("2024-00-01")).toBe(false);
  });

  it("rejects day 00", () => {
    expect(isIsoDate("2024-01-00")).toBe(false);
  });

  it("rejects Feb 30", () => {
    expect(isIsoDate("2024-02-30")).toBe(false);
  });

  it("rejects April 31", () => {
    expect(isIsoDate("2024-04-31")).toBe(false);
  });

  it("rejects short year format", () => {
    expect(isIsoDate("24-01-15")).toBe(false);
  });

  it("rejects missing zero-padding on month", () => {
    expect(isIsoDate("2024-1-15")).toBe(false);
  });

  it("rejects missing zero-padding on day", () => {
    expect(isIsoDate("2024-01-5")).toBe(false);
  });

  it("rejects arbitrary string", () => {
    expect(isIsoDate("not-a-date")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isIsoDate("")).toBe(false);
  });

  it("rejects null", () => {
    expect(isIsoDate(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isIsoDate(undefined)).toBe(false);
  });

  it("rejects number", () => {
    expect(isIsoDate(20240115)).toBe(false);
  });

  it("rejects ISO timestamp (has time component)", () => {
    // YYYY-MM-DDTHH:MM:SS.sssZ does not match YYYY-MM-DD exactly
    expect(isIsoDate("2024-01-15T10:30:00.000Z")).toBe(false);
  });
});

// ─── isIsoTimestamp ──────────────────────────────────────────────────────────

describe("isIsoTimestamp", () => {
  it("accepts a full UTC ISO timestamp", () => {
    expect(isIsoTimestamp("2024-01-15T10:30:00.000Z")).toBe(true);
  });

  it("accepts a date-only string (Date.parse accepts YYYY-MM-DD)", () => {
    expect(isIsoTimestamp("2024-01-15")).toBe(true);
  });

  it("accepts timestamp with timezone offset", () => {
    expect(isIsoTimestamp("2024-01-15T10:30:00+02:00")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isIsoTimestamp("")).toBe(false);
  });

  it("rejects 'not-a-date'", () => {
    expect(isIsoTimestamp("not-a-date")).toBe(false);
  });

  it("rejects a string longer than 40 chars", () => {
    // Prevent feeding huge strings to Date.parse
    expect(isIsoTimestamp("2024-01-15T10:30:00.000Z" + "x".repeat(20))).toBe(false);
  });

  it("rejects null", () => {
    expect(isIsoTimestamp(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isIsoTimestamp(undefined)).toBe(false);
  });

  it("rejects a numeric timestamp", () => {
    expect(isIsoTimestamp(1705312200000)).toBe(false);
  });
});

// ─── isValidDataEnc ──────────────────────────────────────────────────────────

describe("isValidDataEnc", () => {
  it("accepts valid base64 of minimum length (40 chars)", () => {
    expect(isValidDataEnc(VALID_ENC)).toBe(true);
  });

  it("accepts longer realistic ciphertext", () => {
    expect(isValidDataEnc(REAL_ENC)).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidDataEnc("")).toBe(false);
  });

  it("rejects string shorter than 40 chars", () => {
    expect(isValidDataEnc("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA".slice(0, 36))).toBe(false);
  });

  it("rejects base64 with invalid characters", () => {
    expect(isValidDataEnc("AAAA!AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")).toBe(false);
  });

  it("rejects base64 with space character", () => {
    expect(isValidDataEnc("AAAA AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")).toBe(false);
  });

  it("rejects base64 with incorrect padding (length not multiple of 4)", () => {
    // 39 chars — not a valid base64 block boundary
    expect(isValidDataEnc("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).toBe(false);
  });

  it("rejects null", () => {
    expect(isValidDataEnc(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isValidDataEnc(undefined)).toBe(false);
  });

  it("rejects number", () => {
    expect(isValidDataEnc(42)).toBe(false);
  });
});

// ─── isValidEntry ─────────────────────────────────────────────────────────────

function validEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: VALID_UUID,
    date: VALID_DATE,
    created_at: VALID_TS,
    updated_at: VALID_TS,
    data_enc: REAL_ENC,
    ...overrides,
  };
}

describe("isValidEntry — valid cases", () => {
  it("accepts a complete minimal entry", () => {
    expect(isValidEntry(validEntry())).toBe(true);
  });

  it("accepts entry with null next_review and review_interval", () => {
    expect(isValidEntry(validEntry({ next_review: null, review_interval: null }))).toBe(true);
  });

  it("accepts entry with valid next_review timestamp", () => {
    expect(isValidEntry(validEntry({ next_review: "2024-02-01T00:00:00.000Z" }))).toBe(true);
  });

  it("accepts entry with valid positive review_interval", () => {
    expect(isValidEntry(validEntry({ review_interval: 2.5 }))).toBe(true);
  });

  it("accepts entry without optional fields (undefined)", () => {
    const { id, date, created_at, updated_at, data_enc } = validEntry();
    expect(isValidEntry({ id, date, created_at, updated_at, data_enc })).toBe(true);
  });
});

describe("isValidEntry — required field failures", () => {
  it("rejects non-object", () => {
    expect(isValidEntry("string")).toBe(false);
    expect(isValidEntry(null)).toBe(false);
    expect(isValidEntry(42)).toBe(false);
  });

  it("rejects missing id", () => {
    expect(isValidEntry(validEntry({ id: undefined }))).toBe(false);
  });

  it("rejects id that is not a UUID", () => {
    expect(isValidEntry(validEntry({ id: "entry_1234_abc" }))).toBe(false);
  });

  it("rejects empty id", () => {
    expect(isValidEntry(validEntry({ id: "" }))).toBe(false);
  });

  it("rejects id with wrong UUID format", () => {
    expect(isValidEntry(validEntry({ id: "12345678-1234-1234-1234-12345678abc" }))).toBe(false);
  });

  it("rejects non-string id", () => {
    expect(isValidEntry(validEntry({ id: 123 }))).toBe(false);
  });

  it("rejects invalid date format", () => {
    expect(isValidEntry(validEntry({ date: "2024/01/15" }))).toBe(false);
  });

  it("rejects date 'not-a-date'", () => {
    expect(isValidEntry(validEntry({ date: "not-a-date" }))).toBe(false);
  });

  it("rejects missing date", () => {
    expect(isValidEntry(validEntry({ date: undefined }))).toBe(false);
  });

  it("rejects invalid created_at", () => {
    expect(isValidEntry(validEntry({ created_at: "garbage" }))).toBe(false);
  });

  it("rejects invalid updated_at", () => {
    expect(isValidEntry(validEntry({ updated_at: "" }))).toBe(false);
  });

  it("rejects empty data_enc", () => {
    expect(isValidEntry(validEntry({ data_enc: "" }))).toBe(false);
  });

  it("rejects non-base64 data_enc", () => {
    expect(isValidEntry(validEntry({ data_enc: "not!base64!!at!all!!!garbage!!!" }))).toBe(false);
  });

  it("rejects too-short data_enc", () => {
    expect(isValidEntry(validEntry({ data_enc: "AAAA" }))).toBe(false);
  });
});

describe("isValidEntry — optional field failures", () => {
  it("rejects invalid next_review string", () => {
    expect(isValidEntry(validEntry({ next_review: "not-a-date" }))).toBe(false);
  });

  it("rejects review_interval of NaN", () => {
    expect(isValidEntry(validEntry({ review_interval: NaN }))).toBe(false);
  });

  it("rejects review_interval of Infinity", () => {
    expect(isValidEntry(validEntry({ review_interval: Infinity }))).toBe(false);
  });

  it("rejects review_interval of -Infinity", () => {
    expect(isValidEntry(validEntry({ review_interval: -Infinity }))).toBe(false);
  });

  it("rejects negative review_interval", () => {
    expect(isValidEntry(validEntry({ review_interval: -1 }))).toBe(false);
  });

  it("rejects review_interval of zero", () => {
    expect(isValidEntry(validEntry({ review_interval: 0 }))).toBe(false);
  });

  it("rejects non-numeric review_interval", () => {
    expect(isValidEntry(validEntry({ review_interval: "1" }))).toBe(false);
  });
});

// ─── isValidThread ────────────────────────────────────────────────────────────

function validThread(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: VALID_UUID,
    created_at: VALID_TS,
    updated_at: VALID_TS,
    data_enc: REAL_ENC,
    ...overrides,
  };
}

describe("isValidThread — valid cases", () => {
  it("accepts a minimal thread (no optional fields)", () => {
    expect(isValidThread(validThread())).toBe(true);
  });

  it("accepts thread with done=0", () => {
    expect(isValidThread(validThread({ done: 0 }))).toBe(true);
  });

  it("accepts thread with done=1", () => {
    expect(isValidThread(validThread({ done: 1 }))).toBe(true);
  });

  it("accepts thread with null done", () => {
    expect(isValidThread(validThread({ done: null }))).toBe(true);
  });

  it("accepts thread with valid due_date", () => {
    expect(isValidThread(validThread({ due_date: "2024-03-01" }))).toBe(true);
  });

  it("accepts thread with null due_date", () => {
    expect(isValidThread(validThread({ due_date: null }))).toBe(true);
  });

  it("accepts thread with a color string", () => {
    expect(isValidThread(validThread({ color: "red" }))).toBe(true);
  });

  it("accepts thread with null color", () => {
    expect(isValidThread(validThread({ color: null }))).toBe(true);
  });
});

describe("isValidThread — required field failures", () => {
  it("rejects non-object", () => {
    expect(isValidThread(null)).toBe(false);
    expect(isValidThread("thread")).toBe(false);
  });

  it("rejects non-UUID id", () => {
    expect(isValidThread(validThread({ id: "thread_123_abc" }))).toBe(false);
  });

  it("rejects invalid created_at", () => {
    expect(isValidThread(validThread({ created_at: "garbage" }))).toBe(false);
  });

  it("rejects invalid updated_at", () => {
    expect(isValidThread(validThread({ updated_at: "" }))).toBe(false);
  });

  it("rejects empty data_enc", () => {
    expect(isValidThread(validThread({ data_enc: "" }))).toBe(false);
  });

  it("rejects non-base64 data_enc", () => {
    expect(isValidThread(validThread({ data_enc: "not-base64!!!!" }))).toBe(false);
  });
});

describe("isValidThread — optional field failures", () => {
  it("rejects done=2 (not a valid boolean integer)", () => {
    expect(isValidThread(validThread({ done: 2 }))).toBe(false);
  });

  it("rejects done=-1", () => {
    expect(isValidThread(validThread({ done: -1 }))).toBe(false);
  });

  it("rejects done=true (boolean instead of integer)", () => {
    expect(isValidThread(validThread({ done: true }))).toBe(false);
  });

  it("rejects done=false (boolean instead of integer)", () => {
    expect(isValidThread(validThread({ done: false }))).toBe(false);
  });

  it("rejects done='1' (string instead of integer)", () => {
    expect(isValidThread(validThread({ done: "1" }))).toBe(false);
  });

  it("rejects invalid due_date", () => {
    expect(isValidThread(validThread({ due_date: "not-a-date" }))).toBe(false);
  });

  it("rejects due_date with invalid calendar date (Feb 30)", () => {
    expect(isValidThread(validThread({ due_date: "2024-02-30" }))).toBe(false);
  });

  it("rejects color longer than 50 chars", () => {
    expect(isValidThread(validThread({ color: "x".repeat(51) }))).toBe(false);
  });

  it("rejects non-string color", () => {
    expect(isValidThread(validThread({ color: 42 }))).toBe(false);
  });
});
