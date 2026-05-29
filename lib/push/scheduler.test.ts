import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("./send", () => ({ broadcast: vi.fn() }));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => "and_result"),
  eq:  vi.fn(() => "eq_result"),
  lte: vi.fn(() => "lte_result"),
  sql: vi.fn(() => "sql_result"),
}));

vi.mock("@/lib/db/schema/shared/entries",  () => ({ entries:  { date: {} } }));
vi.mock("@/lib/db/schema/shared/threads",  () => ({ threads:  { done: {}, due_date: {} } }));

const mockAllFn = vi.fn<() => unknown[]>();
vi.mock("@/lib/db/server", () => ({
  getDb: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        all:   mockAllFn,
        where: vi.fn(() => ({ all: mockAllFn })),
      })),
    })),
  })),
}));

import { sendDailyReminder, sendDueReminders } from "./scheduler";
import { broadcast } from "./send";
const mockBroadcast = vi.mocked(broadcast);

// ── Helpers ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PUSH_TZ = "UTC";
  mockBroadcast.mockResolvedValue({ sent: 1, failed: 0 });
});

// today in UTC as YYYY-MM-DD
function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(new Date());
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(d);
}

// ── sendDailyReminder ─────────────────────────────────────────────────────────

describe("sendDailyReminder", () => {
  it("broadcasts when no entries were written today (count = 0)", async () => {
    mockAllFn.mockReturnValue([{ count: 0 }]);

    await sendDailyReminder();

    expect(mockBroadcast).toHaveBeenCalledOnce();
  });

  it("skips broadcast when entries exist today (count > 0)", async () => {
    mockAllFn.mockReturnValue([{ count: 2 }]);

    await sendDailyReminder();

    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it("passes a builder function to broadcast", async () => {
    mockAllFn.mockReturnValue([{ count: 0 }]);

    await sendDailyReminder();

    const arg = mockBroadcast.mock.calls[0][0];
    expect(typeof arg).toBe("function");
  });

  it("builder returns English payload for lang='en'", async () => {
    mockAllFn.mockReturnValue([{ count: 0 }]);
    await sendDailyReminder();

    const builder = mockBroadcast.mock.calls[0][0] as (lang: string) => { title: string; body: string };
    const payload = builder("en");

    expect(payload.title).toBe("gleaned");
    expect(payload.body).toBe("What did you learn today?");
  });

  it("builder returns German payload for lang='de'", async () => {
    mockAllFn.mockReturnValue([{ count: 0 }]);
    await sendDailyReminder();

    const builder = mockBroadcast.mock.calls[0][0] as (lang: string) => { title: string; body: string };
    const payload = builder("de");

    expect(payload.title).toBe("gleaned");
    expect(payload.body).toBe("Was hast du heute gelernt?");
  });
});

// ── sendDueReminders ──────────────────────────────────────────────────────────

describe("sendDueReminders", () => {
  it("does not broadcast when no todos are due or overdue", async () => {
    mockAllFn.mockReturnValue([]);

    await sendDueReminders();

    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it("broadcasts when at least one todo is due today", async () => {
    mockAllFn.mockReturnValue([{ due_date: today() }]);

    await sendDueReminders();

    expect(mockBroadcast).toHaveBeenCalledOnce();
  });

  it("broadcasts when at least one todo is overdue", async () => {
    mockAllFn.mockReturnValue([{ due_date: yesterday() }]);

    await sendDueReminders();

    expect(mockBroadcast).toHaveBeenCalledOnce();
  });

  it("broadcasts when there is a mix of due-today and overdue todos", async () => {
    mockAllFn.mockReturnValue([
      { due_date: today() },
      { due_date: yesterday() },
      { due_date: today() },
    ]);

    await sendDueReminders();

    expect(mockBroadcast).toHaveBeenCalledOnce();
  });

  it("passes a builder function to broadcast", async () => {
    mockAllFn.mockReturnValue([{ due_date: today() }]);

    await sendDueReminders();

    const arg = mockBroadcast.mock.calls[0][0];
    expect(typeof arg).toBe("function");
  });

  it("builder payload contains due title for English", async () => {
    mockAllFn.mockReturnValue([{ due_date: today() }]);
    await sendDueReminders();

    const builder = mockBroadcast.mock.calls[0][0] as (lang: string) => { title: string; body: string };
    const payload = builder("en");

    expect(payload.title).toContain("gleaned");
    expect(payload.body.length).toBeGreaterThan(0);
  });

  it("builder payload contains due title for German", async () => {
    mockAllFn.mockReturnValue([{ due_date: today() }]);
    await sendDueReminders();

    const builder = mockBroadcast.mock.calls[0][0] as (lang: string) => { title: string; body: string };
    const payload = builder("de");

    expect(payload.title).toContain("gleaned");
    expect(payload.body.length).toBeGreaterThan(0);
  });

  it("body mentions count for multiple due-today todos", async () => {
    mockAllFn.mockReturnValue([
      { due_date: today() },
      { due_date: today() },
      { due_date: today() },
    ]);
    await sendDueReminders();

    const builder = mockBroadcast.mock.calls[0][0] as (lang: string) => { title: string; body: string };
    const payload = builder("en");

    expect(payload.body).toMatch(/3/);
  });

  it("body mentions overdue count when all todos are overdue", async () => {
    mockAllFn.mockReturnValue([
      { due_date: yesterday() },
      { due_date: yesterday() },
    ]);
    await sendDueReminders();

    const builder = mockBroadcast.mock.calls[0][0] as (lang: string) => { title: string; body: string };
    const payload = builder("en");

    expect(payload.body).toMatch(/2/);
    expect(payload.body).toMatch(/overdue/i);
  });
});
