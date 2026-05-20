import { describe, it, expect, beforeEach, vi } from "vitest";
import { isAuthenticated, logout } from "./auth";

// ─── Mocks ────────────────────────────────────────────────────────────────────
// auth.ts imports from ./db (PouchDB) and ./crypto (sessionStorage).
// We mock both so tests stay pure and fast.

vi.mock("./db", () => ({
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
}));

vi.mock("./crypto", () => ({
  deriveKey: vi.fn(),
  generateSalt: vi.fn(() => new Uint8Array(16)),
  saltToBase64: vi.fn(() => "base64salt"),
  base64ToSalt: vi.fn(() => new Uint8Array(16)),
  encryptText: vi.fn(async () => "encrypted"),
  decryptText: vi.fn(async () => "gleaned-v1"),
  storeKey: vi.fn(),
  clearKey: vi.fn(),
}));

const _store: Record<string, string> = {};

vi.stubGlobal("sessionStorage", {
  getItem: (k: string) => _store[k] ?? null,
  setItem: (k: string, v: string) => { _store[k] = v; },
  removeItem: (k: string) => { delete _store[k]; },
  clear: () => { Object.keys(_store).forEach((k) => delete _store[k]); },
});

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
});

// ─── isAuthenticated ──────────────────────────────────────────────────────────

describe("isAuthenticated", () => {
  it("returns false when session is not set", () => {
    expect(isAuthenticated()).toBe(false);
  });

  it("returns false when session has unexpected value", () => {
    sessionStorage.setItem("gleaned_session", "true");
    expect(isAuthenticated()).toBe(false);
  });

  it("returns true when session is set to '1'", () => {
    sessionStorage.setItem("gleaned_session", "1");
    expect(isAuthenticated()).toBe(true);
  });
});

// ─── logout ───────────────────────────────────────────────────────────────────

describe("logout", () => {
  it("clears the session so isAuthenticated returns false", () => {
    sessionStorage.setItem("gleaned_session", "1");
    expect(isAuthenticated()).toBe(true);
    logout();
    expect(isAuthenticated()).toBe(false);
  });

  it("calls clearKey to wipe the encryption key from memory", async () => {
    const { clearKey } = await import("./crypto");
    logout();
    expect(clearKey).toHaveBeenCalledOnce();
  });

  it("is safe to call when not logged in (no throw)", () => {
    expect(() => logout()).not.toThrow();
  });

  it("removes gleaned_session from sessionStorage", () => {
    sessionStorage.setItem("gleaned_session", "1");
    logout();
    expect(sessionStorage.getItem("gleaned_session")).toBeNull();
  });
});
