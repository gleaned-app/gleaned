import { describe, it, expect, vi, afterEach } from "vitest";
import { urlBase64ToUint8Array, isPushSupported, getPushStatus, subscribeToPush, unsubscribeFromPush } from "./notifications";

// urlBase64ToUint8Array converts a URL-safe base64 string (used for VAPID keys)
// to a Uint8Array. It must handle padding and URL-safe character substitution.

describe("urlBase64ToUint8Array", () => {
  it("converts a known value correctly", () => {
    // "hello" in standard base64 is "aGVsbG8="
    // URL-safe base64 without padding: "aGVsbG8"
    const result = urlBase64ToUint8Array("aGVsbG8");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(result)).toBe("hello");
  });

  it("round-trips: Uint8Array → base64url → Uint8Array", () => {
    const original = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const b64 = btoa(String.fromCharCode(...original))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
    const result = urlBase64ToUint8Array(b64);
    expect(result).toEqual(original);
  });

  it("handles standard base64 with padding included", () => {
    // Standard base64 with '=' padding should still work
    const result = urlBase64ToUint8Array("aGVsbG8=");
    expect(new TextDecoder().decode(result)).toBe("hello");
  });

  it("replaces '-' with '+' (URL-safe → standard base64)", () => {
    // 0xfb byte encodes to '+' in standard base64, '-' in URL-safe
    const withMinus = urlBase64ToUint8Array("-w");     // URL-safe
    const withPlus  = urlBase64ToUint8Array("+w");     // standard
    expect(withMinus).toEqual(withPlus);
  });

  it("replaces '_' with '/' (URL-safe → standard base64)", () => {
    // '/' in standard base64 becomes '_' in URL-safe
    const withUnderscore = urlBase64ToUint8Array("_w"); // URL-safe
    const withSlash      = urlBase64ToUint8Array("/w"); // standard
    expect(withUnderscore).toEqual(withSlash);
  });

  it("correctly pads when input length % 4 == 2 (needs 2 '=' chars)", () => {
    // "ab" in base64 without padding: "YWI" (length 3, % 4 == 3 → 1 padding)
    // "a"  in base64 without padding: "YQ"  (length 2, % 4 == 2 → 2 padding)
    const result = urlBase64ToUint8Array("YQ");
    expect(new TextDecoder().decode(result)).toBe("a");
  });

  it("correctly pads when input length % 4 == 3 (needs 1 '=' char)", () => {
    const result = urlBase64ToUint8Array("YWI");
    expect(new TextDecoder().decode(result)).toBe("ab");
  });

  it("no padding needed when input length % 4 == 0", () => {
    const result = urlBase64ToUint8Array("aGVs"); // "hel"
    expect(new TextDecoder().decode(result)).toBe("hel");
  });

  it("handles a realistic VAPID public key length (65 bytes → 88 base64url chars)", () => {
    // Generate 65 random bytes and encode as base64url
    const bytes = new Uint8Array(65);
    crypto.getRandomValues(bytes);
    const b64url = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
    const result = urlBase64ToUint8Array(b64url);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(65);
    expect(result).toEqual(bytes);
  });

  it("returns Uint8Array for empty string input", () => {
    const result = urlBase64ToUint8Array("");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(0);
  });
});

// ── isPushSupported ───────────────────────────────────────────────────────────

describe("isPushSupported", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns false when navigator has no serviceWorker", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("window", { PushManager: {}, Notification: {} });
    vi.stubGlobal("Notification", {});
    expect(await isPushSupported()).toBe(false);
  });

  it("returns false when PushManager is absent from window", async () => {
    vi.stubGlobal("navigator", { serviceWorker: {} });
    vi.stubGlobal("window", { Notification: {} });
    vi.stubGlobal("Notification", {});
    expect(await isPushSupported()).toBe(false);
  });

  it("returns false when Notification is absent from window", async () => {
    vi.stubGlobal("navigator", { serviceWorker: {} });
    vi.stubGlobal("window", { PushManager: {} });
    expect(await isPushSupported()).toBe(false);
  });

  it("returns true when all APIs are present", async () => {
    vi.stubGlobal("navigator", { serviceWorker: {} });
    vi.stubGlobal("window", { PushManager: {}, Notification: {} });
    vi.stubGlobal("Notification", {});
    expect(await isPushSupported()).toBe(true);
  });
});

// ── getPushStatus ─────────────────────────────────────────────────────────────

describe("getPushStatus", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubSupportedEnv(permission: string, sub: unknown = null) {
    const mockGetSubscription = vi.fn().mockResolvedValue(sub);
    vi.stubGlobal("navigator", {
      serviceWorker: { ready: Promise.resolve({ pushManager: { getSubscription: mockGetSubscription } }) },
    });
    vi.stubGlobal("Notification", { permission });
    vi.stubGlobal("window", { PushManager: {}, Notification: {} });
    return { mockGetSubscription };
  }

  it("returns 'unsupported' when push APIs are absent", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("window", {});
    expect(await getPushStatus()).toBe("unsupported");
  });

  it("returns 'denied' when Notification.permission is 'denied'", async () => {
    stubSupportedEnv("denied");
    expect(await getPushStatus()).toBe("denied");
  });

  it("returns 'subscribed' when a PushSubscription exists", async () => {
    stubSupportedEnv("granted", { endpoint: "https://push.example.com/1" });
    expect(await getPushStatus()).toBe("subscribed");
  });

  it("returns 'unsubscribed' when no subscription exists", async () => {
    stubSupportedEnv("granted", null);
    expect(await getPushStatus()).toBe("unsubscribed");
  });
});

// ── subscribeToPush ───────────────────────────────────────────────────────────

describe("subscribeToPush", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns false when push is not supported", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("window", {});
    expect(await subscribeToPush()).toBe(false);
  });

  it("returns false when the user denies permission", async () => {
    vi.stubGlobal("navigator", { serviceWorker: { ready: Promise.resolve({ pushManager: {} }) } });
    vi.stubGlobal("Notification", { permission: "default", requestPermission: vi.fn().mockResolvedValue("denied") });
    vi.stubGlobal("window", { PushManager: {}, Notification: {} });
    expect(await subscribeToPush()).toBe(false);
  });

  it("returns false when VAPID key endpoint returns non-ok", async () => {
    vi.stubGlobal("navigator", { serviceWorker: { ready: Promise.resolve({ pushManager: {} }) } });
    vi.stubGlobal("Notification", { permission: "default", requestPermission: vi.fn().mockResolvedValue("granted") });
    vi.stubGlobal("window", { PushManager: {}, Notification: {} });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await subscribeToPush()).toBe(false);
  });

  it("returns false when VAPID key fetch throws", async () => {
    vi.stubGlobal("navigator", { serviceWorker: { ready: Promise.resolve({ pushManager: {} }) } });
    vi.stubGlobal("Notification", { permission: "default", requestPermission: vi.fn().mockResolvedValue("granted") });
    vi.stubGlobal("window", { PushManager: {}, Notification: {} });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    expect(await subscribeToPush()).toBe(false);
  });

  it("returns true and posts to /api/push/subscribe on success", async () => {
    const mockSub = {
      toJSON: () => ({ endpoint: "https://push.example.com/1", keys: { p256dh: "k", auth: "a" } }),
    };
    vi.stubGlobal("navigator", {
      serviceWorker: {
        ready: Promise.resolve({ pushManager: { subscribe: vi.fn().mockResolvedValue(mockSub) } }),
      },
    });
    vi.stubGlobal("Notification", { permission: "default", requestPermission: vi.fn().mockResolvedValue("granted") });
    vi.stubGlobal("window", { PushManager: {}, Notification: {} });
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ publicKey: "dGVzdA" }) })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    expect(await subscribeToPush("de")).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][0]).toBe("/api/push/subscribe");
  });

  it("calls sub.unsubscribe() and returns false when server POST fails", async () => {
    const mockUnsubscribe = vi.fn().mockResolvedValue(true);
    const mockSub = {
      toJSON: () => ({ endpoint: "https://push.example.com/1", keys: {} }),
      unsubscribe: mockUnsubscribe,
    };
    vi.stubGlobal("navigator", {
      serviceWorker: {
        ready: Promise.resolve({ pushManager: { subscribe: vi.fn().mockResolvedValue(mockSub) } }),
      },
    });
    vi.stubGlobal("Notification", { permission: "default", requestPermission: vi.fn().mockResolvedValue("granted") });
    vi.stubGlobal("window", { PushManager: {}, Notification: {} });
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ publicKey: "dGVzdA" }) })
      .mockRejectedValueOnce(new Error("server error"));
    vi.stubGlobal("fetch", mockFetch);

    expect(await subscribeToPush()).toBe(false);
    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});

// ── unsubscribeFromPush ───────────────────────────────────────────────────────

describe("unsubscribeFromPush", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is a no-op when no subscription exists", async () => {
    const mockGetSubscription = vi.fn().mockResolvedValue(null);
    vi.stubGlobal("navigator", {
      serviceWorker: { ready: Promise.resolve({ pushManager: { getSubscription: mockGetSubscription } }) },
    });
    await unsubscribeFromPush();
    expect(mockGetSubscription).toHaveBeenCalled();
  });

  it("calls DELETE /api/push/subscribe and unsubscribes when subscription exists", async () => {
    const mockUnsubscribe = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue({
              endpoint: "https://push.example.com/1",
              unsubscribe: mockUnsubscribe,
            }),
          },
        }),
      },
    });
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    await unsubscribeFromPush();
    expect(mockFetch).toHaveBeenCalledWith("/api/push/subscribe", expect.objectContaining({ method: "DELETE" }));
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it("still calls sub.unsubscribe() even if DELETE fetch fails", async () => {
    const mockUnsubscribe = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue({
              endpoint: "https://push.example.com/1",
              unsubscribe: mockUnsubscribe,
            }),
          },
        }),
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    await unsubscribeFromPush();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});
