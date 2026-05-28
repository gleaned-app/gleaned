import { describe, it, expect, beforeEach, vi } from "vitest";
import { isAuthenticated, logout, login, setupPassword, hasPassword } from "./auth";
import { storeKey, clearKey } from "./crypto";

vi.mock("./db", () => ({
  setDbAuthenticated: vi.fn(),
}));

vi.mock("./api-client", () => ({
  apiFetch: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor() { super("Session expired"); this.name = "UnauthorizedError"; }
  },
}));

vi.mock("./crypto", () => ({
  PBKDF2_ITERATIONS: 600_000,
  deriveKey:    vi.fn(async () => ({ type: "secret" })),
  generateSalt: vi.fn(() => new Uint8Array(16)),
  saltToBase64: vi.fn(() => "base64salt"),
  base64ToSalt: vi.fn(() => new Uint8Array(16)),
  storeKey:     vi.fn(),
  clearKey:     vi.fn(),
}));

import { apiFetch } from "./api-client";
const mockApiFetch = vi.mocked(apiFetch);
const mockStoreKey = vi.mocked(storeKey);
const mockClearKey = vi.mocked(clearKey);

beforeEach(async () => {
  await logout();
  vi.clearAllMocks();
});

function makeResponse(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

// ─── isAuthenticated ──────────────────────────────────────────────────────────

describe("isAuthenticated", () => {
  it("returns false on fresh state", () => {
    expect(isAuthenticated()).toBe(false);
  });
});

// ─── hasPassword ─────────────────────────────────────────────────────────────

describe("hasPassword", () => {
  it("returns true when server reports setup: true", async () => {
    mockApiFetch.mockResolvedValue(makeResponse({ setup: true }));
    expect(await hasPassword()).toBe(true);
  });

  it("returns false when server reports setup: false", async () => {
    mockApiFetch.mockResolvedValue(makeResponse({ setup: false }));
    expect(await hasPassword()).toBe(false);
  });

  it("returns false when apiFetch throws", async () => {
    mockApiFetch.mockRejectedValue(new Error("network error"));
    expect(await hasPassword()).toBe(false);
  });
});

// ─── setupPassword ────────────────────────────────────────────────────────────

describe("setupPassword", () => {
  it("calls /api/auth/setup and stores the derived key", async () => {
    mockApiFetch.mockResolvedValue(makeResponse({ ok: true }, 200));

    await setupPassword("newpassword");

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/auth/setup",
      expect.objectContaining({ method: "POST" }),
    );
    expect(mockStoreKey).toHaveBeenCalledOnce();
    expect(isAuthenticated()).toBe(true);
  });
});

// ─── login ───────────────────────────────────────────────────────────────────

describe("login", () => {
  it("returns true and sets isAuthenticated when server accepts the password", async () => {
    mockApiFetch
      .mockResolvedValueOnce(makeResponse({ setup: true }))
      .mockResolvedValueOnce(makeResponse({ encryptionSalt: "base64salt", encryptionIterations: 600_000 }));

    const result = await login("correctpassword");

    expect(result).toBe(true);
    expect(isAuthenticated()).toBe(true);
    expect(mockStoreKey).toHaveBeenCalledOnce();
  });

  it("returns false when login endpoint responds with non-ok status", async () => {
    mockApiFetch
      .mockResolvedValueOnce(makeResponse({ setup: true }))
      .mockResolvedValueOnce(makeResponse({ error: "Invalid password" }, 401));

    const result = await login("wrongpassword");

    expect(result).toBe(false);
    expect(isAuthenticated()).toBe(false);
    expect(mockStoreKey).not.toHaveBeenCalled();
  });

  it("returns false when server is not set up (no verifier)", async () => {
    mockApiFetch.mockResolvedValueOnce(makeResponse({ setup: false }));

    const result = await login("anypassword");

    expect(result).toBe(false);
    expect(isAuthenticated()).toBe(false);
  });

  it("does not call storeKey on failed login", async () => {
    mockApiFetch
      .mockResolvedValueOnce(makeResponse({ setup: true }))
      .mockResolvedValueOnce(makeResponse({ error: "bad" }, 401));

    await login("bad");

    expect(mockStoreKey).not.toHaveBeenCalled();
  });
});

// ─── logout ───────────────────────────────────────────────────────────────────

describe("logout", () => {
  it("sets isAuthenticated to false", async () => {
    mockApiFetch
      .mockResolvedValueOnce(makeResponse({ setup: true }))
      .mockResolvedValueOnce(makeResponse({ encryptionSalt: "s", encryptionIterations: 600_000 }));
    await login("correct");
    expect(isAuthenticated()).toBe(true);

    mockApiFetch.mockResolvedValueOnce(makeResponse({ ok: true }));
    await logout();

    expect(isAuthenticated()).toBe(false);
  });

  it("calls clearKey to wipe the encryption key", async () => {
    await logout();
    expect(mockClearKey).toHaveBeenCalledOnce();
  });

  it("is safe to call when already logged out", async () => {
    mockApiFetch.mockResolvedValue(makeResponse({ ok: true }));
    await expect(logout()).resolves.not.toThrow();
  });

  it("is idempotent: multiple logouts leave isAuthenticated false", async () => {
    mockApiFetch.mockResolvedValue(makeResponse({ ok: true }));
    await logout();
    await logout();
    expect(isAuthenticated()).toBe(false);
  });
});

// ─── brute-force resistance ───────────────────────────────────────────────────

describe("brute-force resistance", () => {
  it("each failed login attempt keeps isAuthenticated false", async () => {
    for (let i = 0; i < 3; i++) {
      mockApiFetch
        .mockResolvedValueOnce(makeResponse({ setup: true }))
        .mockResolvedValueOnce(makeResponse({ error: "bad" }, 401));
      await login("wrong");
      expect(isAuthenticated()).toBe(false);
    }
  });
});
