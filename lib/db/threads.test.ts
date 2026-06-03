import { describe, it, expect, vi, beforeEach } from "vitest";
import { setAuthState } from "./client";
import type { Thread } from "@/types/thread";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../api-client", () => ({
  apiFetch: vi.fn(),
  assertOk: (res: Response) => { if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { name: "ApiError", status: (res as unknown as { status: number }).status }); },
}));
vi.mock("./thread-crypto", () => ({
  encryptThreadToApi: vi.fn(),
  decryptThreadFromRow: vi.fn(),
}));

import { apiFetch } from "../api-client";
import { encryptThreadToApi, decryptThreadFromRow } from "./thread-crypto";
const mockApiFetch = vi.mocked(apiFetch);
const mockEncrypt  = vi.mocked(encryptThreadToApi);
const mockDecrypt  = vi.mocked(decryptThreadFromRow);

import {
  saveThread, getThreads, updateThreadDoc,
  updateThreadDueDate, updateThreadColor, updateThreadText,
  deleteThread,
} from "./threads";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeResponse(body: unknown = {}, status = 200) {
  return { ok: status < 400, status, json: vi.fn().mockResolvedValue(body) } as unknown as Response;
}

function makeApiRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "thread_1",
    done: 0,
    due_date: null,
    color: null,
    created_at: "2026-01-15T10:00:00.000Z",
    updated_at: "2026-01-15T10:00:00.000Z",
    data_enc: "enc",
    ...overrides,
  };
}

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    _id: "thread_1",
    type: "thread",
    text: "Learn TypeScript generics",
    done: false,
    createdAt: "2026-01-15T10:00:00.000Z",
    ...overrides,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  setAuthState("authenticated");
  mockEncrypt.mockResolvedValue(makeApiRow() as ReturnType<typeof makeApiRow>);
  mockDecrypt.mockImplementation(async (row) => makeThread({ _id: row.id }));
});

// ── saveThread ────────────────────────────────────────────────────────────────

describe("saveThread", () => {
  it("calls POST /api/threads", async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    await saveThread("learn TypeScript");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/threads",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("calls encryptThreadToApi with correctly structured thread", async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    await saveThread("learn TypeScript", "2026-02-01", "#ff0000");
    const [arg] = mockEncrypt.mock.calls[0];
    expect(arg.text).toBe("learn TypeScript");
    expect(arg.dueDate).toBe("2026-02-01");
    expect(arg.color).toBe("#ff0000");
    expect(arg.done).toBe(false);
    expect(arg.type).toBe("thread");
    expect(arg._id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("returns thread without dueDate/color when not provided", async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    const thread = await saveThread("simple thread");
    expect(thread.dueDate).toBeUndefined();
    expect(thread.color).toBeUndefined();
  });

  it("throws when state is locked", async () => {
    setAuthState("locked");
    await expect(saveThread("test")).rejects.toThrow("gleaned: not authenticated");
  });
});

// ── getThreads ────────────────────────────────────────────────────────────────

describe("getThreads", () => {
  it("calls GET /api/threads", async () => {
    mockApiFetch.mockResolvedValue(makeResponse([]));
    await getThreads();
    expect(mockApiFetch).toHaveBeenCalledWith("/api/threads");
  });

  it("decrypts each row and returns threads", async () => {
    mockApiFetch.mockResolvedValue(makeResponse([makeApiRow({ id: "t1" }), makeApiRow({ id: "t2" })]));
    const threads = await getThreads();
    expect(threads).toHaveLength(2);
    expect(mockDecrypt).toHaveBeenCalledTimes(2);
  });

  it("returns empty array for empty response", async () => {
    mockApiFetch.mockResolvedValue(makeResponse([]));
    expect(await getThreads()).toHaveLength(0);
  });
});

// ── updateThreadDoc ───────────────────────────────────────────────────────────

describe("updateThreadDoc", () => {
  it("toggles done from false to true", async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    const result = await updateThreadDoc(makeThread({ done: false }));
    expect(result.done).toBe(true);
    const [arg] = mockEncrypt.mock.calls[0];
    expect(arg.done).toBe(true);
  });

  it("toggles done from true to false", async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    const result = await updateThreadDoc(makeThread({ done: true }));
    expect(result.done).toBe(false);
    const [arg] = mockEncrypt.mock.calls[0];
    expect(arg.done).toBe(false);
  });

  it("calls PUT /api/threads/:id", async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    await updateThreadDoc(makeThread({ _id: "thread_abc" }));
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/threads/thread_abc",
      expect.objectContaining({ method: "PUT" }),
    );
  });
});

// ── updateThreadDueDate ───────────────────────────────────────────────────────

describe("updateThreadDueDate", () => {
  it("sets dueDate when a value is provided", async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    const result = await updateThreadDueDate(makeThread(), "2026-06-01");
    expect(result.dueDate).toBe("2026-06-01");
  });

  it("removes dueDate when undefined is passed", async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    const result = await updateThreadDueDate(makeThread({ dueDate: "2026-01-15" }), undefined);
    expect("dueDate" in result).toBe(false);
  });

  it("calls PUT /api/threads/:id", async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    await updateThreadDueDate(makeThread({ _id: "thread_xyz" }), "2026-06-01");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/threads/thread_xyz",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("passes updated dueDate to encryptThreadToApi", async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    await updateThreadDueDate(makeThread(), "2026-06-15");
    const [arg] = mockEncrypt.mock.calls[0];
    expect(arg.dueDate).toBe("2026-06-15");
  });
});

// ── updateThreadColor ─────────────────────────────────────────────────────────

describe("updateThreadColor", () => {
  it("sets color when a value is provided", async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    const result = await updateThreadColor(makeThread(), "#ff0000");
    expect(result.color).toBe("#ff0000");
  });

  it("removes color when undefined is passed", async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    const result = await updateThreadColor(makeThread({ color: "#ff0000" }), undefined);
    expect("color" in result).toBe(false);
  });

  it("passes updated color to encryptThreadToApi", async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    await updateThreadColor(makeThread(), "#00ff00");
    const [arg] = mockEncrypt.mock.calls[0];
    expect(arg.color).toBe("#00ff00");
  });
});

// ── updateThreadText ──────────────────────────────────────────────────────────

describe("updateThreadText", () => {
  it("updates text and calls PUT", async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    const result = await updateThreadText(makeThread({ _id: "thread_t" }), "new text content");
    expect(result.text).toBe("new text content");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/threads/thread_t",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("passes new text to encryptThreadToApi", async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    await updateThreadText(makeThread(), "updated text");
    const [arg] = mockEncrypt.mock.calls[0];
    expect(arg.text).toBe("updated text");
  });
});

// ── deleteThread ──────────────────────────────────────────────────────────────

describe("deleteThread", () => {
  it("calls DELETE /api/threads/:id", async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    await deleteThread("thread_del");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/threads/thread_del",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("throws when state is locked", async () => {
    setAuthState("locked");
    await expect(deleteThread("thread_1")).rejects.toThrow("gleaned: not authenticated");
  });
});
