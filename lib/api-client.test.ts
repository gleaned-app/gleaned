import { describe, it, expect, vi, afterEach } from "vitest";
import { apiFetch, encodeDataEnc, decodeDataEnc, UnauthorizedError } from "./api-client";

afterEach(() => vi.unstubAllGlobals());

// ── apiFetch ──────────────────────────────────────────────────────────────────

describe("apiFetch", () => {
  it("returns the response for a 200 request", async () => {
    const mockResponse = { status: 200, ok: true } as Response;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));
    expect(await apiFetch("/api/test")).toBe(mockResponse);
  });

  it("passes credentials: 'include' to every request", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 200 });
    vi.stubGlobal("fetch", mockFetch);
    await apiFetch("/api/test");
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ credentials: "include" });
  });

  it("adds Content-Type: application/json when body is provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 200 });
    vi.stubGlobal("fetch", mockFetch);
    await apiFetch("/api/entries", { method: "POST", body: '{"key":"value"}' });
    expect((mockFetch.mock.calls[0][1].headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("does not add Content-Type when no body is present", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 200 });
    vi.stubGlobal("fetch", mockFetch);
    await apiFetch("/api/entries");
    expect((mockFetch.mock.calls[0][1].headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("does not throw for non-401 error responses (404, 500, etc.)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 404, ok: false }));
    const res = await apiFetch("/api/missing");
    expect(res.status).toBe(404);
  });

  it("throws UnauthorizedError on 401 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 401 }));
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    await expect(apiFetch("/api/protected")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws an error with message 'Session expired' on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 401 }));
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    await expect(apiFetch("/api/protected")).rejects.toThrow("Session expired");
  });

  it("dispatches 'gleaned:unauthorized' CustomEvent on 401 when window is available", async () => {
    const mockDispatch = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 401 }));
    vi.stubGlobal("window", { dispatchEvent: mockDispatch });
    await apiFetch("/api/protected").catch(() => {});
    expect(mockDispatch).toHaveBeenCalledOnce();
    const dispatched = mockDispatch.mock.calls[0][0] as Event;
    expect(dispatched.type).toBe("gleaned:unauthorized");
  });

  it("merges caller headers with the Content-Type header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 200 });
    vi.stubGlobal("fetch", mockFetch);
    await apiFetch("/api/test", {
      method: "POST",
      body: "{}",
      headers: { "X-Custom": "value" },
    });
    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-Custom"]).toBe("value");
  });
});

// ── UnauthorizedError ─────────────────────────────────────────────────────────

describe("UnauthorizedError", () => {
  it("is an instance of Error", () => {
    expect(new UnauthorizedError()).toBeInstanceOf(Error);
  });

  it("has name 'UnauthorizedError'", () => {
    expect(new UnauthorizedError().name).toBe("UnauthorizedError");
  });

  it("is caught by instanceof UnauthorizedError check", () => {
    let caught: unknown;
    try { throw new UnauthorizedError(); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(UnauthorizedError);
  });
});

// ── encodeDataEnc / decodeDataEnc ─────────────────────────────────────────────

describe("encodeDataEnc / decodeDataEnc", () => {
  it("round-trips arbitrary bytes: encode → decode", () => {
    const bytes = new Uint8Array([1, 2, 3, 128, 255, 0, 64]);
    expect(decodeDataEnc(encodeDataEnc(bytes))).toEqual(bytes);
  });

  it("handles empty array", () => {
    expect(encodeDataEnc(new Uint8Array(0))).toBe("");
    expect(decodeDataEnc("")).toEqual(new Uint8Array(0));
  });

  it("produces standard base64 output matching btoa", () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    expect(encodeDataEnc(bytes)).toBe(btoa("Hello"));
  });

  it("handles large arrays that cross the 32 768-byte chunk boundary", () => {
    const large = new Uint8Array(40_000).fill(42);
    expect(decodeDataEnc(encodeDataEnc(large))).toEqual(large);
  });

  it("round-trips all-zero bytes", () => {
    const bytes = new Uint8Array(16).fill(0);
    expect(decodeDataEnc(encodeDataEnc(bytes))).toEqual(bytes);
  });

  it("round-trips all-max bytes (255)", () => {
    const bytes = new Uint8Array(16).fill(255);
    expect(decodeDataEnc(encodeDataEnc(bytes))).toEqual(bytes);
  });
});
