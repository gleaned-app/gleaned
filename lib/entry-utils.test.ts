import { describe, it, expect } from "vitest";
import { parseSource } from "./entry-utils";

describe("parseSource", () => {
  // ── URLs ────────────────────────────────────────────────────────────────────

  it("detects https URL and strips www from label", () => {
    const r = parseSource("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(r.kind).toBe("url");
    expect(r.label).toBe("youtube.com");
    expect(r.href).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("detects http URL", () => {
    const r = parseSource("http://example.com/article");
    expect(r.kind).toBe("url");
    expect(r.label).toBe("example.com");
  });

  it("preserves subdomain other than www", () => {
    const r = parseSource("https://arxiv.org/abs/2301.00001");
    expect(r.kind).toBe("url");
    expect(r.label).toBe("arxiv.org");
  });

  it("preserves non-www subdomain", () => {
    const r = parseSource("https://blog.example.com/post");
    expect(r.kind).toBe("url");
    expect(r.label).toBe("blog.example.com");
  });

  // ── DOIs ────────────────────────────────────────────────────────────────────

  it("detects bare DOI (10.xxxx/...)", () => {
    const r = parseSource("10.1145/1234567.1234568");
    expect(r.kind).toBe("doi");
    expect(r.href).toBe("https://doi.org/10.1145/1234567.1234568");
    expect(r.label).toBe("DOI 10.1145");
  });

  it("detects doi:-prefixed DOI", () => {
    const r = parseSource("doi:10.1038/nature14539");
    expect(r.kind).toBe("doi");
    expect(r.href).toBe("https://doi.org/10.1038/nature14539");
  });

  it("detects doi: with space after colon", () => {
    const r = parseSource("doi: 10.1038/nature14539");
    expect(r.kind).toBe("doi");
    expect(r.href).toBe("https://doi.org/10.1038/nature14539");
  });

  it("detects https://doi.org/-prefixed DOI", () => {
    const r = parseSource("https://doi.org/10.1038/nature14539");
    expect(r.kind).toBe("doi");
    expect(r.href).toBe("https://doi.org/10.1038/nature14539");
    expect(r.label).toBe("DOI 10.1038");
  });

  // ── ISBNs ───────────────────────────────────────────────────────────────────

  it("detects ISBN-13 with hyphens", () => {
    const r = parseSource("978-0-13-468599-1");
    expect(r.kind).toBe("isbn");
    expect(r.label).toBe("ISBN 978-0-13-468599-1");
    expect(r.href).toBeUndefined();
  });

  it("detects ISBN-13 without separators", () => {
    const r = parseSource("9780134685991");
    expect(r.kind).toBe("isbn");
  });

  it("detects ISBN-10 with hyphens", () => {
    const r = parseSource("0-306-40615-2");
    expect(r.kind).toBe("isbn");
    expect(r.label).toBe("ISBN 0-306-40615-2");
  });

  it("detects ISBN-10 with X check digit", () => {
    const r = parseSource("0-19-853453-X");
    expect(r.kind).toBe("isbn");
  });

  // ── Plain text ───────────────────────────────────────────────────────────────

  it("returns plain text for book titles", () => {
    const r = parseSource("Make It Stick — Brown, Roediger, McDaniel");
    expect(r.kind).toBe("text");
    expect(r.label).toBe("Make It Stick — Brown, Roediger, McDaniel");
    expect(r.href).toBeUndefined();
  });

  it("returns plain text for course names", () => {
    const r = parseSource("Coursera: Learning How to Learn");
    expect(r.kind).toBe("text");
  });

  it("returns empty label for empty string", () => {
    const r = parseSource("");
    expect(r.label).toBe("");
    expect(r.kind).toBe("text");
  });

  it("trims surrounding whitespace", () => {
    const r = parseSource("  https://example.com  ");
    expect(r.kind).toBe("url");
    expect(r.label).toBe("example.com");
  });

  it("does not misclassify short digit strings as ISBN", () => {
    const r = parseSource("2024");
    expect(r.kind).toBe("text");
  });
});
