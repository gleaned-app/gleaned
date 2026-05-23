import { describe, it, expect, beforeEach } from "vitest";
import { toLocalDateStr, isEntry, setAuthState, requireAuth } from "./client";
import type { Entry } from "@/types/entry";

// ─── toLocalDateStr ───────────────────────────────────────────────────────────

describe("toLocalDateStr", () => {
  it("formats a known date to YYYY-MM-DD", () => {
    expect(toLocalDateStr(new Date(2026, 0, 1))).toBe("2026-01-01");
  });

  it("zero-pads month and day", () => {
    expect(toLocalDateStr(new Date(2026, 2, 5))).toBe("2026-03-05");
  });

  it("handles end of year", () => {
    expect(toLocalDateStr(new Date(2025, 11, 31))).toBe("2025-12-31");
  });

  it("returns a string in YYYY-MM-DD format when called without arguments", () => {
    const result = toLocalDateStr();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ─── isEntry ──────────────────────────────────────────────────────────────────

describe("isEntry", () => {
  const validEntry: Entry = {
    _id: "entry_1234_abcde",
    type: "entry",
    content: "test",
    tags: [],
    date: "2026-01-01",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("returns true for a valid Entry", () => {
    expect(isEntry(validEntry)).toBe(true);
  });

  it("returns false for a Thread", () => {
    expect(isEntry({ _id: "thread_1", type: "thread", text: "x", done: false, createdAt: "" })).toBe(false);
  });

  it("returns false for null", () => {
    expect(isEntry(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isEntry(undefined)).toBe(false);
  });

  it("returns false when _id is not a string", () => {
    expect(isEntry({ type: "entry", _id: 42 })).toBe(false);
  });

  it("returns false for plain string", () => {
    expect(isEntry("entry")).toBe(false);
  });

  it("returns false for object missing type", () => {
    expect(isEntry({ _id: "entry_1" })).toBe(false);
  });

  it("returns false for settings doc", () => {
    expect(isEntry({ _id: "gleaned_settings", type: "settings" })).toBe(false);
  });
});

// ─── requireAuth / setAuthState ───────────────────────────────────────────────

describe("requireAuth", () => {
  beforeEach(() => {
    // Always reset to pending so tests are isolated from each other.
    setAuthState("pending");
  });

  it("does not throw in pending state (initial state)", () => {
    expect(() => requireAuth()).not.toThrow();
  });

  it("does not throw in authenticated state", () => {
    setAuthState("authenticated");
    expect(() => requireAuth()).not.toThrow();
  });

  it("throws in locked state", () => {
    setAuthState("locked");
    expect(() => requireAuth()).toThrow("gleaned: not authenticated");
  });

  it("transitions: pending → authenticated → locked → throws", () => {
    setAuthState("authenticated");
    expect(() => requireAuth()).not.toThrow();

    setAuthState("locked");
    expect(() => requireAuth()).toThrow();
  });

  it("transitions: locked → authenticated → no longer throws", () => {
    setAuthState("locked");
    setAuthState("authenticated");
    expect(() => requireAuth()).not.toThrow();
  });
});
