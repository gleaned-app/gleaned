import { describe, it, expect } from "vitest";
import { T } from "./i18n";

// i18n.ts imports useSettings from settings-context (React hook).
// We only use the exported T object here — useT() is never called,
// so no mock needed. The import resolves fine in Node.

// ─── Completeness ─────────────────────────────────────────────────────────────

describe("translation completeness", () => {
  it("de and en have the same set of keys", () => {
    const deKeys = Object.keys(T.de).sort();
    const enKeys = Object.keys(T.en).sort();
    expect(deKeys).toEqual(enKeys);
  });

  it("no translation key is undefined in de", () => {
    for (const [key, value] of Object.entries(T.de)) {
      expect(value, `T.de.${key} is undefined`).toBeDefined();
    }
  });

  it("no translation key is undefined in en", () => {
    for (const [key, value] of Object.entries(T.en)) {
      expect(value, `T.en.${key} is undefined`).toBeDefined();
    }
  });

  it("all string values are non-empty in de", () => {
    for (const [key, value] of Object.entries(T.de)) {
      if (typeof value === "string") {
        expect(value.length, `T.de.${key} is empty string`).toBeGreaterThan(0);
      }
    }
  });

  it("all string values are non-empty in en", () => {
    for (const [key, value] of Object.entries(T.en)) {
      if (typeof value === "string") {
        expect(value.length, `T.en.${key} is empty string`).toBeGreaterThan(0);
      }
    }
  });
});

// ─── entryCount ───────────────────────────────────────────────────────────────

describe("entryCount", () => {
  it("de: 0 → plural", () => {
    expect(T.de.entryCount(0)).toBe("0 Einträge");
  });
  it("de: 1 → singular", () => {
    expect(T.de.entryCount(1)).toBe("1 Eintrag");
  });
  it("de: 2 → plural", () => {
    expect(T.de.entryCount(2)).toBe("2 Einträge");
  });
  it("de: 10 → plural", () => {
    expect(T.de.entryCount(10)).toBe("10 Einträge");
  });

  it("en: 0 → plural", () => {
    expect(T.en.entryCount(0)).toBe("0 entries");
  });
  it("en: 1 → singular", () => {
    expect(T.en.entryCount(1)).toBe("1 entry");
  });
  it("en: 2 → plural", () => {
    expect(T.en.entryCount(2)).toBe("2 entries");
  });
  it("en: 10 → plural", () => {
    expect(T.en.entryCount(10)).toBe("10 entries");
  });
});

// ─── noEntriesTag ─────────────────────────────────────────────────────────────

describe("noEntriesTag", () => {
  it("de: includes tag with #", () => {
    expect(T.de.noEntriesTag("javascript")).toBe("Keine Einträge für #javascript");
  });
  it("en: includes tag with #", () => {
    expect(T.en.noEntriesTag("javascript")).toBe("No entries for #javascript");
  });
  it("handles empty tag string", () => {
    expect(T.de.noEntriesTag("")).toBe("Keine Einträge für #");
    expect(T.en.noEntriesTag("")).toBe("No entries for #");
  });
  it("handles tag with spaces", () => {
    expect(T.en.noEntriesTag("machine learning")).toContain("machine learning");
  });
});

// ─── overdue ──────────────────────────────────────────────────────────────────

describe("overdue", () => {
  it("de: 1 day", () => {
    expect(T.de.overdue(1)).toBe("1d überfällig");
  });
  it("de: 0 days", () => {
    expect(T.de.overdue(0)).toBe("0d überfällig");
  });
  it("de: 30 days", () => {
    expect(T.de.overdue(30)).toBe("30d überfällig");
  });

  it("en: 1 day", () => {
    expect(T.en.overdue(1)).toBe("1d overdue");
  });
  it("en: 0 days", () => {
    expect(T.en.overdue(0)).toBe("0d overdue");
  });
  it("en: 30 days", () => {
    expect(T.en.overdue(30)).toBe("30d overdue");
  });
});

// ─── reviewDaysAgo ────────────────────────────────────────────────────────────

describe("reviewDaysAgo", () => {
  it("de: 1 → singular", () => {
    expect(T.de.reviewDaysAgo(1)).toBe("vor 1 Tag");
  });
  it("de: 2 → plural", () => {
    expect(T.de.reviewDaysAgo(2)).toBe("vor 2 Tagen");
  });
  it("de: 7 → plural", () => {
    expect(T.de.reviewDaysAgo(7)).toBe("vor 7 Tagen");
  });

  it("en: 1 → singular", () => {
    expect(T.en.reviewDaysAgo(1)).toBe("1 day ago");
  });
  it("en: 2 → plural", () => {
    expect(T.en.reviewDaysAgo(2)).toBe("2 days ago");
  });
  it("en: 7 → plural", () => {
    expect(T.en.reviewDaysAgo(7)).toBe("7 days ago");
  });
});

// ─── weeksAgo ────────────────────────────────────────────────────────────────

describe("weeksAgo", () => {
  it("de: 1 → singular", () => {
    expect(T.de.weeksAgo(1)).toBe("Vor 1 Woche");
  });
  it("de: 2 → plural", () => {
    expect(T.de.weeksAgo(2)).toBe("Vor 2 Wochen");
  });
  it("de: 5 → plural", () => {
    expect(T.de.weeksAgo(5)).toBe("Vor 5 Wochen");
  });

  it("en: 1 → singular", () => {
    expect(T.en.weeksAgo(1)).toBe("1 week ago");
  });
  it("en: 2 → plural", () => {
    expect(T.en.weeksAgo(2)).toBe("2 weeks ago");
  });
  it("en: 5 → plural", () => {
    expect(T.en.weeksAgo(5)).toBe("5 weeks ago");
  });
});

// ─── reviewOf ────────────────────────────────────────────────────────────────

describe("reviewOf", () => {
  it("de: 3 of 10", () => {
    expect(T.de.reviewOf(3, 10)).toBe("3 von 10");
  });
  it("de: 0 of 0", () => {
    expect(T.de.reviewOf(0, 0)).toBe("0 von 0");
  });
  it("en: 3 of 10", () => {
    expect(T.en.reviewOf(3, 10)).toBe("3 of 10");
  });
  it("en: done equals total", () => {
    expect(T.en.reviewOf(5, 5)).toBe("5 of 5");
  });
});

// ─── importResult ────────────────────────────────────────────────────────────

describe("importResult", () => {
  it("de: some imported, some skipped", () => {
    expect(T.de.importResult(5, 2)).toBe("5 importiert, 2 übersprungen");
  });
  it("de: all skipped", () => {
    expect(T.de.importResult(0, 10)).toBe("0 importiert, 10 übersprungen");
  });
  it("en: some imported, some skipped", () => {
    expect(T.en.importResult(5, 2)).toBe("5 imported, 2 skipped");
  });
  it("en: all imported", () => {
    expect(T.en.importResult(10, 0)).toBe("10 imported, 0 skipped");
  });
});

// ─── fileTooLarge ─────────────────────────────────────────────────────────────

describe("fileTooLarge", () => {
  it("de: includes filename", () => {
    expect(T.de.fileTooLarge("photo.jpg")).toContain("photo.jpg");
  });
  it("de: mentions size limit", () => {
    expect(T.de.fileTooLarge("video.mp4")).toContain("10 MB");
  });
  it("en: includes filename", () => {
    expect(T.en.fileTooLarge("photo.jpg")).toContain("photo.jpg");
  });
  it("en: mentions size limit", () => {
    expect(T.en.fileTooLarge("video.mp4")).toContain("10 MB");
  });
});
