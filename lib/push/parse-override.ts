export type PushOverride = { title?: string; body?: string; url?: string };

// Safely parses the optional override body from POST /api/push/send.
// Only known fields are passed through; url is restricted to same-origin
// relative paths so a caller with SEND_SECRET cannot craft a notification
// that links outside the gleaned instance.
export function parsePushOverride(raw: unknown): PushOverride {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const result: PushOverride = {};
  if (typeof r.title === "string" && r.title.trim().length > 0 && r.title.length <= 100) {
    result.title = r.title.trim();
  }
  if (typeof r.body === "string" && r.body.trim().length > 0 && r.body.length <= 300) {
    result.body = r.body.trim();
  }
  // Accept paths only: must start with "/" but not "//" (protocol-relative URL).
  // Rejects http://, https://, javascript:, and any other scheme.
  if (typeof r.url === "string" && r.url.startsWith("/") && !r.url.startsWith("//") && r.url.length <= 2000) {
    result.url = r.url;
  }
  return result;
}
