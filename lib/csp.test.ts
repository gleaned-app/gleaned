import { describe, it, expect } from "vitest";
import { buildCsp } from "./csp";

const NONCE = "dGVzdC1ub25jZQ=="; // base64("test-nonce")

describe("buildCsp — structure", () => {
  it("contains default-src 'self'", () => {
    expect(buildCsp(NONCE, false)).toContain("default-src 'self'");
  });

  it("contains the nonce in script-src", () => {
    expect(buildCsp(NONCE, false)).toContain(`'nonce-${NONCE}'`);
  });

  it("contains 'strict-dynamic' in script-src", () => {
    expect(buildCsp(NONCE, false)).toContain("'strict-dynamic'");
  });

  it("contains 'self' in script-src", () => {
    const csp = buildCsp(NONCE, false);
    const scriptSrcMatch = csp.match(/script-src ([^;]+)/);
    expect(scriptSrcMatch?.[1]).toContain("'self'");
  });

  it("contains style-src with 'unsafe-inline' (required for React inline styles)", () => {
    expect(buildCsp(NONCE, false)).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("contains img-src with data: and blob: for attachments and export", () => {
    expect(buildCsp(NONCE, false)).toContain("img-src 'self' data: blob:");
  });

  it("contains media-src with data: for audio/video attachments", () => {
    expect(buildCsp(NONCE, false)).toContain("media-src 'self' data:");
  });

  it("contains font-src 'self'", () => {
    expect(buildCsp(NONCE, false)).toContain("font-src 'self'");
  });

  it("contains connect-src 'self'", () => {
    expect(buildCsp(NONCE, false)).toContain("connect-src 'self'");
  });

  it("contains worker-src 'self' for service worker", () => {
    expect(buildCsp(NONCE, false)).toContain("worker-src 'self'");
  });

  it("contains object-src 'none'", () => {
    expect(buildCsp(NONCE, false)).toContain("object-src 'none'");
  });

  it("contains base-uri 'self'", () => {
    expect(buildCsp(NONCE, false)).toContain("base-uri 'self'");
  });

  it("contains form-action 'self'", () => {
    expect(buildCsp(NONCE, false)).toContain("form-action 'self'");
  });

  it("contains frame-src 'none'", () => {
    expect(buildCsp(NONCE, false)).toContain("frame-src 'none'");
  });

  it("contains frame-ancestors 'none' (clickjacking protection)", () => {
    expect(buildCsp(NONCE, false)).toContain("frame-ancestors 'none'");
  });

  it("contains upgrade-insecure-requests", () => {
    expect(buildCsp(NONCE, false)).toContain("upgrade-insecure-requests");
  });
});

describe("buildCsp — dev vs prod", () => {
  it("adds 'unsafe-eval' in dev mode (React debugging)", () => {
    expect(buildCsp(NONCE, true)).toContain("'unsafe-eval'");
  });

  it("omits 'unsafe-eval' in prod mode", () => {
    expect(buildCsp(NONCE, false)).not.toContain("'unsafe-eval'");
  });
});

describe("buildCsp — nonce isolation", () => {
  it("different nonces produce different CSP values", () => {
    const a = buildCsp("nonce-aaa", false);
    const b = buildCsp("nonce-bbb", false);
    expect(a).not.toBe(b);
  });

  it("nonce appears only in script-src (style-src uses 'unsafe-inline' instead)", () => {
    const csp = buildCsp(NONCE, false);
    const styleSrcMatch = csp.match(/style-src ([^;]+)/);
    expect(styleSrcMatch?.[1]).not.toContain(`nonce-${NONCE}`);
  });

  it("nonce value is embedded verbatim in the CSP string", () => {
    const nonce = "abc123XYZ=";
    expect(buildCsp(nonce, false)).toContain(`'nonce-${nonce}'`);
  });
});

describe("buildCsp — directives are semicolon-separated", () => {
  it("directives are joined with '; '", () => {
    const csp = buildCsp(NONCE, false);
    expect(csp).toMatch(/default-src 'self'; script-src/);
  });

  it("no trailing semicolon", () => {
    expect(buildCsp(NONCE, false)).not.toMatch(/;\s*$/);
  });
});
