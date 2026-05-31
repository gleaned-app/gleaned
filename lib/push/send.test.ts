import { describe, it, expect, vi, beforeEach } from "vitest";
import { parsePushOverride } from "./parse-override";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSendNotification = vi.fn();
const mockSetVapidDetails  = vi.fn();

vi.mock("web-push", () => ({
  default: {
    setVapidDetails:  mockSetVapidDetails,
    sendNotification: mockSendNotification,
  },
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(() => "eq_result") }));

vi.mock("@/lib/db/schema/server/push_subscriptions", () => ({
  push_subscriptions: { id: {} },
}));

const mockDeleteRun = vi.fn();
const mockDeleteWhere = vi.fn(() => ({ run: mockDeleteRun }));
const mockAll = vi.fn<() => unknown[]>(() => []);
const mockSelectFrom = vi.fn(() => ({ all: mockAll }));

function makeDb() {
  return {
    select: vi.fn(() => ({ from: mockSelectFrom })),
    delete: vi.fn(() => ({ where: mockDeleteWhere })),
  };
}

vi.mock("@/lib/db/server", () => ({ getDb: vi.fn() }));
import { getDb } from "@/lib/db/server";
const mockGetDb = vi.mocked(getDb);

// ── Helpers ───────────────────────────────────────────────────────────────────

type Sub = { id: string; endpoint: string; p256dh: string; auth_key: string; lang: string; tz: string; created_at: string };

function makeSub(overrides: Partial<Sub> = {}): Sub {
  return {
    id: "sub1",
    endpoint: "https://push.example.com/1",
    p256dh:   "p256dh_value",
    auth_key: "auth_value",
    lang:     "en",
    tz:       "UTC",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VAPID_PUBLIC_KEY  = "test_public_key";
  process.env.VAPID_PRIVATE_KEY = "test_private_key";
  process.env.VAPID_SUBJECT     = "mailto:test@example.com";
  mockGetDb.mockReturnValue(makeDb() as unknown as ReturnType<typeof getDb>);
  mockAll.mockReturnValue([]);
});

// ── broadcast() ───────────────────────────────────────────────────────────────

describe("broadcast — no VAPID keys", () => {
  it("returns {sent:0, failed:0} and does not call sendNotification", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    // Re-import with cleared module state so _initialized is false
    vi.resetModules();
    const { broadcast } = await import("./send");

    const result = await broadcast({ title: "t", body: "b" });

    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(mockSendNotification).not.toHaveBeenCalled();
  });
});

describe("broadcast — VAPID configured", () => {
  // Re-import fresh for each group so _initialized is reset
  let broadcast: (typeof import("./send"))["broadcast"];

  beforeEach(async () => {
    vi.resetModules();
    ({ broadcast } = await import("./send"));
  });

  it("returns {sent:0, failed:0} when there are no subscriptions", async () => {
    mockAll.mockReturnValue([]);
    const result = await broadcast({ title: "t", body: "b" });
    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("calls sendNotification once per subscription", async () => {
    mockAll.mockReturnValue([makeSub()]);
    mockSendNotification.mockResolvedValue(undefined);

    await broadcast({ title: "t", body: "b", url: "/" });

    expect(mockSendNotification).toHaveBeenCalledOnce();
    expect(mockSendNotification).toHaveBeenCalledWith(
      { endpoint: "https://push.example.com/1", keys: { p256dh: "p256dh_value", auth: "auth_value" } },
      expect.any(String),
    );
  });

  it("serializes the payload as JSON", async () => {
    mockAll.mockReturnValue([makeSub()]);
    mockSendNotification.mockResolvedValue(undefined);

    await broadcast({ title: "gleaned", body: "hello", url: "/review" });

    const sent = JSON.parse(mockSendNotification.mock.calls[0][1] as string);
    expect(sent).toEqual({ title: "gleaned", body: "hello", url: "/review" });
  });

  it("returns correct sent count for multiple subscriptions", async () => {
    mockAll.mockReturnValue([makeSub({ id: "a" }), makeSub({ id: "b" }), makeSub({ id: "c" })]);
    mockSendNotification.mockResolvedValue(undefined);

    const result = await broadcast({ title: "t", body: "b" });

    expect(result).toEqual({ sent: 3, failed: 0 });
  });

  it("counts failed when sendNotification rejects with a non-410 error", async () => {
    mockAll.mockReturnValue([makeSub()]);
    mockSendNotification.mockRejectedValue({ statusCode: 500, message: "Server error" });

    const result = await broadcast({ title: "t", body: "b" });

    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(mockDeleteWhere).not.toHaveBeenCalled();
  });

  it("removes subscription and counts failed on 410 Gone", async () => {
    mockAll.mockReturnValue([makeSub({ id: "sub_gone" })]);
    mockSendNotification.mockRejectedValue({ statusCode: 410 });

    const result = await broadcast({ title: "t", body: "b" });

    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(mockDeleteWhere).toHaveBeenCalledOnce();
  });

  it("returns mixed counts when some subs succeed and some fail", async () => {
    mockAll.mockReturnValue([
      makeSub({ id: "ok" }),
      makeSub({ id: "fail" }),
      makeSub({ id: "gone" }),
    ]);
    mockSendNotification
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({ statusCode: 500 })
      .mockRejectedValueOnce({ statusCode: 410 });

    const result = await broadcast({ title: "t", body: "b" });

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(2);
  });

  it("passes correct lang to the payload builder", async () => {
    mockAll.mockReturnValue([
      makeSub({ id: "de_sub", lang: "de" }),
      makeSub({ id: "en_sub", lang: "en" }),
    ]);
    mockSendNotification.mockResolvedValue(undefined);

    const seenLangs: string[] = [];
    await broadcast((lang) => { seenLangs.push(lang); return { title: "t", body: "b" }; });

    expect(seenLangs).toContain("de");
    expect(seenLangs).toContain("en");
  });

  it("falls back to 'de' for unknown lang values", async () => {
    mockAll.mockReturnValue([makeSub({ lang: "fr" })]);
    mockSendNotification.mockResolvedValue(undefined);

    const seenLangs: string[] = [];
    await broadcast((lang) => { seenLangs.push(lang); return { title: "t", body: "b" }; });

    expect(seenLangs).toEqual(["de"]);
  });

  it("accepts a plain payload object without a builder", async () => {
    mockAll.mockReturnValue([makeSub()]);
    mockSendNotification.mockResolvedValue(undefined);

    const result = await broadcast({ title: "static", body: "payload" });
    expect(result.sent).toBe(1);
  });
});

// ─── parsePushOverride ────────────────────────────────────────────────────────

describe("parsePushOverride", () => {
  it("returns empty object for non-object input", () => {
    expect(parsePushOverride(null)).toEqual({});
    expect(parsePushOverride("string")).toEqual({});
    expect(parsePushOverride(42)).toEqual({});
    expect(parsePushOverride([])).toEqual({});
  });

  it("returns empty object for empty input", () => {
    expect(parsePushOverride({})).toEqual({});
  });

  it("passes through valid title, body, and relative url", () => {
    expect(parsePushOverride({ title: "Hello", body: "World", url: "/review" }))
      .toEqual({ title: "Hello", body: "World", url: "/review" });
  });

  it("trims whitespace from title and body", () => {
    const result = parsePushOverride({ title: "  hi  ", body: "  there  " });
    expect(result.title).toBe("hi");
    expect(result.body).toBe("there");
  });

  it("accepts url '/' (root path)", () => {
    expect(parsePushOverride({ url: "/" })).toEqual({ url: "/" });
  });

  it("rejects external http url", () => {
    expect(parsePushOverride({ url: "http://evil.com" })).toEqual({});
  });

  it("rejects external https url", () => {
    expect(parsePushOverride({ url: "https://evil.com/gleaned" })).toEqual({});
  });

  it("rejects protocol-relative url (//)", () => {
    expect(parsePushOverride({ url: "//evil.com" })).toEqual({});
  });

  it("rejects javascript: url", () => {
    expect(parsePushOverride({ url: "javascript:alert(1)" })).toEqual({});
  });

  it("rejects url that exceeds 2000 chars", () => {
    expect(parsePushOverride({ url: "/" + "a".repeat(2001) })).toEqual({});
  });

  it("rejects title over 100 chars", () => {
    expect(parsePushOverride({ title: "a".repeat(101) })).toEqual({});
  });

  it("rejects body over 300 chars", () => {
    expect(parsePushOverride({ body: "a".repeat(301) })).toEqual({});
  });

  it("omits fields that are not title, body, or url", () => {
    const result = parsePushOverride({ title: "ok", icon: "https://evil.com/icon.png", data: { secret: 1 } });
    expect(result).toEqual({ title: "ok" });
    expect(result).not.toHaveProperty("icon");
    expect(result).not.toHaveProperty("data");
  });

  it("omits whitespace-only title and body", () => {
    expect(parsePushOverride({ title: "   ", body: "\t\n" })).toEqual({});
  });

  it("omits fields with non-string values", () => {
    expect(parsePushOverride({ title: 42, body: true, url: null })).toEqual({});
  });
});
