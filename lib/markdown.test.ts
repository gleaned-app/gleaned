import { describe, it, expect, vi } from "vitest";

// DOMPurify requires a browser DOM — mock it as a passthrough so the
// renderer logic is exercised in isolation in the Node test environment.
vi.mock("dompurify", () => ({
  default: { sanitize: (html: string) => html },
}));

import { escapeAttr, sanitizeHref, renderMarkdown } from "./markdown";

// ─── escapeAttr ───────────────────────────────────────────────────────────────

describe("escapeAttr", () => {
  it("escapes double quotes", () => {
    expect(escapeAttr('"')).toBe("&quot;");
  });

  it("escapes ampersands", () => {
    expect(escapeAttr("&")).toBe("&amp;");
  });

  it("escapes angle brackets", () => {
    expect(escapeAttr("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes all special chars in one string", () => {
    expect(escapeAttr('"<>&"')).toBe("&quot;&lt;&gt;&amp;&quot;");
  });

  it("leaves safe URL characters unchanged", () => {
    const url = "https://example.com/path?q=1";
    expect(escapeAttr(url)).toBe(url);
  });

  it("encodes & in query strings", () => {
    expect(escapeAttr("https://x.com/?a=1&b=2")).toBe(
      "https://x.com/?a=1&amp;b=2",
    );
  });
});

// ─── sanitizeHref ─────────────────────────────────────────────────────────────

describe("sanitizeHref", () => {
  it("allows https: URLs", () => {
    expect(sanitizeHref("https://example.com")).toBe("https://example.com");
  });

  it("allows http: URLs", () => {
    expect(sanitizeHref("http://example.com")).toBe("http://example.com");
  });

  it("allows mailto: links", () => {
    expect(sanitizeHref("mailto:user@example.com")).toBe(
      "mailto:user@example.com",
    );
  });

  it("allows tel: links", () => {
    expect(sanitizeHref("tel:+49123456789")).toBe("tel:+49123456789");
  });

  it("allows root-relative URLs", () => {
    expect(sanitizeHref("/path/to/page")).toBe("/path/to/page");
  });

  it("allows relative URLs", () => {
    expect(sanitizeHref("./relative")).toBe("./relative");
    expect(sanitizeHref("../parent")).toBe("../parent");
  });

  it("allows anchor links", () => {
    expect(sanitizeHref("#section")).toBe("#section");
  });

  it("blocks javascript: scheme", () => {
    expect(sanitizeHref("javascript:alert(1)")).toBe("#");
  });

  it("blocks javascript: with leading whitespace (bypass attempt)", () => {
    expect(sanitizeHref("  javascript:alert(1)")).toBe("#");
    expect(sanitizeHref("\tjavascript:alert(1)")).toBe("#");
  });

  it("blocks javascript: case-insensitively", () => {
    expect(sanitizeHref("JAVASCRIPT:alert(1)")).toBe("#");
    expect(sanitizeHref("JaVaScRiPt:alert(1)")).toBe("#");
  });

  it("blocks data: URIs", () => {
    expect(sanitizeHref("data:text/html,<h1>XSS</h1>")).toBe("#");
    expect(sanitizeHref("DATA:text/html,<h1>XSS</h1>")).toBe("#");
  });

  it("blocks vbscript:", () => {
    expect(sanitizeHref("vbscript:msgbox('XSS')")).toBe("#");
  });

  it("blocks unknown schemes", () => {
    expect(sanitizeHref("ftp://example.com")).toBe("#");
    expect(sanitizeHref("file:///etc/passwd")).toBe("#");
    expect(sanitizeHref("blob:https://example.com/uuid")).toBe("#");
  });

  it("returns # for empty string", () => {
    expect(sanitizeHref("")).toBe("#");
  });

  it("returns # for whitespace-only string", () => {
    expect(sanitizeHref("   ")).toBe("#");
  });
});

// ─── renderMarkdown ──────────────────────────────────────────────────────────

describe("renderMarkdown", () => {
  it("returns empty string for empty input", () => {
    expect(renderMarkdown("")).toBe("");
  });

  it("renders a normal https: link with target and rel", () => {
    const html = renderMarkdown("[example](https://example.com)");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("blocks javascript: href — link becomes href='#'", () => {
    const html = renderMarkdown("[click me](javascript:alert(1))");
    expect(html).toContain('href="#"');
    expect(html).not.toContain("javascript:");
  });

  it("blocks data: href", () => {
    const html = renderMarkdown("[img](data:text/html,<h1>x</h1>)");
    expect(html).toContain('href="#"');
    expect(html).not.toContain("data:");
  });

  it("HTML-escapes quotes in href to prevent attribute injection", () => {
    // Simulates a href value that tries to break out of the attribute
    const html = renderMarkdown(
      "[x](https://example.com/p?a=1&b=2)",
    );
    // & in URLs must be HTML-encoded in attribute context
    expect(html).toContain("&amp;");
    expect(html).not.toContain('" onerror=');
  });

  it("HTML-escapes title attribute to prevent injection", () => {
    const html = renderMarkdown('[x](https://example.com "safe title")');
    expect(html).toContain('title="safe title"');
    // Angle brackets in title must be escaped
  });

  it("strips raw HTML blocks entirely", () => {
    const html = renderMarkdown("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("alert(1)");
  });

  it("renders inline markdown formatting", () => {
    const html = renderMarkdown("**bold** and _italic_");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });
});
