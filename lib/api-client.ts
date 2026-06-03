export class UnauthorizedError extends Error {
  constructor() {
    super("Session expired");
    this.name = "UnauthorizedError";
  }
}

export class ApiError extends Error {
  constructor(public readonly status: number) {
    super(`HTTP ${status}`);
    this.name = "ApiError";
  }
}

export function assertOk(res: Response): void {
  if (!res.ok) throw new ApiError(res.status);
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers: HeadersInit = { ...init.headers };
  if (init.body !== undefined) {
    (headers as Record<string, string>)["Content-Type"] = "application/json";
  }

  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers,
  });

  if (response.status === 401) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("gleaned:unauthorized"));
    }
    throw new UnauthorizedError();
  }

  return response;
}

// Codec helpers for data_enc: server stores binary BLOB, wire format is base64.
export function encodeDataEnc(buffer: Uint8Array): string {
  let binary = "";
  const chunk = 32_768;
  for (let i = 0; i < buffer.length; i += chunk) {
    binary += String.fromCharCode(...buffer.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function decodeDataEnc(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
