// Format: month in [01–12], day in [01–31]. The reconstruction check below
// catches phantom days that pass the regex (e.g. "2024-02-30", "2024-99-99").
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function isCalendarDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  // V8's Date.parse silently rolls over out-of-range days, so reconstruct and
  // compare components instead of relying on it to return NaN.
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// Returns the value unchanged if it is a valid YYYY-MM-DD calendar date, otherwise null.
export function parseDate(value: string | null): string | null {
  if (!value || !isCalendarDate(value)) return null;
  return value;
}
