// Strict field-level validators for the /api/import payload.
//
// Every field that lands in the database is validated for type, format, and
// range. Records that fail any check are silently skipped — the import
// response counts skipped vs imported rows so the caller knows what happened.
//
// Design goals:
//  - Reject garbage that would silently corrupt the journal (e.g. NaN dates,
//    non-base64 ciphertext that Buffer.from decodes to zero bytes).
//  - Prevent oversized strings from being stored as primary keys or indexed
//    columns (defense-in-depth against the body-size limit being raised later).
//  - Keep validation purely structural — we never try to decrypt at import
//    time, so we can only verify the ciphertext looks like valid base64 with
//    the minimum length for AES-GCM output.

// YYYY-MM-DD: month in [01–12], day in [01–31]. Date.parse rejects impossible
// combinations (2024-02-30, 2023-02-29, etc.) within the ISO 8601 subset.
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// Canonical UUID v4 format: the only ID format this app produces.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidId(s: unknown): s is string {
  return typeof s === "string" && UUID_RE.test(s);
}

// Standard base64 alphabet with correct padding structure.
// Node's Buffer.from(str, "base64") silently drops unknown characters, so we
// must validate the character set and padding before calling it.
const BASE64_RE =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})$/;

// Minimum AES-GCM blob: 12 B IV + ≥1 B plaintext + 16 B auth tag = 29 B
// → ceil(29 / 3) * 4 = 40 base64 characters.
const DATA_ENC_MIN_LEN = 40;

// ISO calendar date (YYYY-MM-DD). The regex guards format and range; then we
// reconstruct a Date from the parsed components and compare them back — V8's
// Date.parse silently rolls over out-of-range days (2024-02-30 → Mar 1),
// so we cannot rely on it to reject invalid calendar dates.
export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d); // local calendar — only used for range check
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// ISO 8601 timestamp. The length cap (40 chars) prevents passing multi-MB
// strings to Date.parse, which has no built-in length guard.
export function isIsoTimestamp(s: unknown): s is string {
  return (
    typeof s === "string" &&
    s.length > 0 &&
    s.length <= 40 &&
    !isNaN(Date.parse(s))
  );
}

// Valid base64 AES-GCM ciphertext of sufficient minimum length.
export function isValidDataEnc(s: unknown): s is string {
  return (
    typeof s === "string" &&
    s.length >= DATA_ENC_MIN_LEN &&
    BASE64_RE.test(s)
  );
}

export function isValidEntry(e: unknown): e is Record<string, unknown> {
  if (!e || typeof e !== "object") return false;
  const r = e as Record<string, unknown>;
  return (
    // Required fields
    typeof r.id === "string" &&
    UUID_RE.test(r.id) &&
    isIsoDate(r.date) &&
    isIsoTimestamp(r.created_at) &&
    isIsoTimestamp(r.updated_at) &&
    isValidDataEnc(r.data_enc) &&
    // Optional fields — null / undefined pass; any other type rejects the row
    (r.next_review == null || isIsoTimestamp(r.next_review)) &&
    (r.review_interval == null ||
      (typeof r.review_interval === "number" &&
        isFinite(r.review_interval) &&
        r.review_interval > 0))
  );
}

export function isValidThread(t: unknown): t is Record<string, unknown> {
  if (!t || typeof t !== "object") return false;
  const r = t as Record<string, unknown>;
  return (
    // Required fields
    typeof r.id === "string" &&
    UUID_RE.test(r.id) &&
    isIsoTimestamp(r.created_at) &&
    isIsoTimestamp(r.updated_at) &&
    isValidDataEnc(r.data_enc) &&
    // done: SQLite boolean stored as 0/1; absent/null coerced to 0 by the route
    (r.done == null || r.done === 0 || r.done === 1) &&
    // Optional string fields
    (r.due_date == null || isIsoDate(r.due_date)) &&
    (r.color == null || (typeof r.color === "string" && r.color.length <= 50))
  );
}

// Validators for PUT (update) payloads — id comes from the URL, not the body.
// updated_at and data_enc are always required; all other fields are optional.

// date and created_at are required because encryptEntryToApi always sends them
// (they are immutable entry metadata, not fields the user edits).
export function isValidEntryUpdate(b: unknown): b is Record<string, unknown> {
  if (!b || typeof b !== "object") return false;
  const r = b as Record<string, unknown>;
  return (
    isIsoDate(r.date) &&
    isIsoTimestamp(r.created_at) &&
    isIsoTimestamp(r.updated_at) &&
    isValidDataEnc(r.data_enc) &&
    (r.next_review     == null || isIsoTimestamp(r.next_review)) &&
    (r.review_interval == null ||
      (typeof r.review_interval === "number" &&
        isFinite(r.review_interval) &&
        r.review_interval > 0))
  );
}

// created_at is required — the client always sends it with thread updates.
export function isValidThreadUpdate(b: unknown): b is Record<string, unknown> {
  if (!b || typeof b !== "object") return false;
  const r = b as Record<string, unknown>;
  return (
    isIsoTimestamp(r.created_at) &&
    isIsoTimestamp(r.updated_at) &&
    isValidDataEnc(r.data_enc) &&
    (r.done     == null || r.done === 0 || r.done === 1) &&
    (r.due_date == null || isIsoDate(r.due_date)) &&
    (r.color    == null || (typeof r.color === "string" && r.color.length <= 50))
  );
}
