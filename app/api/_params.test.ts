import { describe, it, expect } from "vitest";
import { parseDate } from "./_params";

describe("parseDate", () => {
  // Valid dates
  it("returns a valid date unchanged", () => {
    expect(parseDate("2024-01-15")).toBe("2024-01-15");
  });

  it("accepts Jan 1st", () => {
    expect(parseDate("2024-01-01")).toBe("2024-01-01");
  });

  it("accepts Dec 31st", () => {
    expect(parseDate("2024-12-31")).toBe("2024-12-31");
  });

  it("accepts Feb 29 on a leap year", () => {
    expect(parseDate("2024-02-29")).toBe("2024-02-29");
  });

  // Invalid calendar dates
  it("returns null for Feb 30 (phantom day)", () => {
    expect(parseDate("2024-02-30")).toBeNull();
  });

  it("returns null for Feb 29 on a non-leap year", () => {
    expect(parseDate("2023-02-29")).toBeNull();
  });

  it("returns null for April 31", () => {
    expect(parseDate("2024-04-31")).toBeNull();
  });

  it("returns null for month 13 (2024-99-99 passes old regex)", () => {
    expect(parseDate("2024-99-99")).toBeNull();
  });

  it("returns null for month 00", () => {
    expect(parseDate("2024-00-01")).toBeNull();
  });

  // Format rejections
  it("returns null for null input", () => {
    expect(parseDate(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseDate("")).toBeNull();
  });

  it("returns null for arbitrary string", () => {
    expect(parseDate("not-a-date")).toBeNull();
  });

  it("returns null for ISO timestamp (has time component)", () => {
    expect(parseDate("2024-01-15T10:30:00.000Z")).toBeNull();
  });

  it("returns null for date without zero-padding", () => {
    expect(parseDate("2024-1-5")).toBeNull();
  });

  it("returns null for two-digit year", () => {
    expect(parseDate("24-01-15")).toBeNull();
  });
});
