const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Returns the value unchanged if it is a valid YYYY-MM-DD string, otherwise null.
export function parseDate(value: string | null): string | null {
  if (!value || !ISO_DATE_RE.test(value)) return null;
  return value;
}
