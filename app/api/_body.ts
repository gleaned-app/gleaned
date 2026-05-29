const MAX_IMPORT_BYTES =
  parseInt(process.env.MAX_IMPORT_MB ?? "50", 10) * 1024 * 1024;

export const IMPORT_SIZE_LIMIT = MAX_IMPORT_BYTES;

// Reads the request body up to limitBytes, then parses as JSON.
// Returns null if the body exceeds the limit or is not valid JSON.
export async function readJsonWithLimit(
  request: Request,
  limitBytes = MAX_IMPORT_BYTES,
): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) return null;

  let received = 0;
  const chunks: Uint8Array[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > limitBytes) {
        reader.cancel();
        return undefined; // sentinel: too large
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(combined));
  } catch {
    return null;
  }
}
