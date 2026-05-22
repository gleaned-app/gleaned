import { describe, it, expect } from "vitest";
import { computeNextInterval } from "./review-scheduler";

describe("computeNextInterval", () => {
  // ── still_holds ─────────────────────────────────────────────────────────────

  it("still_holds: multiplies by 2.1 and rounds", () => {
    expect(computeNextInterval(10, "still_holds", false)).toBe(21);
  });

  it("still_holds: caps at 60 days", () => {
    expect(computeNextInterval(30, "still_holds", false)).toBe(60);
    expect(computeNextInterval(100, "still_holds", false)).toBe(60);
  });

  it("still_holds: rounds fractional result", () => {
    // 5 × 2.1 = 10.5 → rounds to 11
    expect(computeNextInterval(5, "still_holds", false)).toBe(11);
  });

  it("still_holds + open gap: halves the interval (ceil)", () => {
    expect(computeNextInterval(10, "still_holds", true)).toBe(11); // base=21, ceil(21*0.5)=11
  });

  it("still_holds + open gap: respects cap before halving", () => {
    // base = min(round(30*2.1), 60) = min(63,60) = 60; ceil(60*0.5) = 30
    expect(computeNextInterval(30, "still_holds", true)).toBe(30);
  });

  // ── needs_revision ───────────────────────────────────────────────────────────

  it("needs_revision: multiplies by 0.5 and rounds", () => {
    expect(computeNextInterval(10, "needs_revision", false)).toBe(5);
  });

  it("needs_revision: minimum 1 day", () => {
    expect(computeNextInterval(1, "needs_revision", false)).toBe(1);
    expect(computeNextInterval(0, "needs_revision", false)).toBe(1);
  });

  it("needs_revision: rounds fractional result", () => {
    // 7 × 0.5 = 3.5 → rounds to 4
    expect(computeNextInterval(7, "needs_revision", false)).toBe(4);
  });

  it("needs_revision + open gap: halves again, minimum 1", () => {
    // base = max(round(10*0.5),1) = 5; ceil(5*0.5) = 3
    expect(computeNextInterval(10, "needs_revision", true)).toBe(3);
  });

  it("needs_revision + open gap: stays at 1 when base is already 1", () => {
    expect(computeNextInterval(1, "needs_revision", true)).toBe(1);
  });

  // ── superseded ───────────────────────────────────────────────────────────────

  it("superseded: always returns 180 days", () => {
    expect(computeNextInterval(1, "superseded", false)).toBe(180);
    expect(computeNextInterval(60, "superseded", false)).toBe(180);
  });

  it("superseded + open gap: halves to 90 days", () => {
    expect(computeNextInterval(1, "superseded", true)).toBe(90);
  });

  // ── boundary / edge ──────────────────────────────────────────────────────────

  it("never returns 0 regardless of input", () => {
    expect(computeNextInterval(0, "still_holds", false)).toBeGreaterThanOrEqual(1);
    expect(computeNextInterval(0, "needs_revision", false)).toBeGreaterThanOrEqual(1);
    expect(computeNextInterval(0, "needs_revision", true)).toBeGreaterThanOrEqual(1);
  });

  it("interval 1 still_holds grows to 2", () => {
    // round(1 * 2.1) = round(2.1) = 2
    expect(computeNextInterval(1, "still_holds", false)).toBe(2);
  });
});
