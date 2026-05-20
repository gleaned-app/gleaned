import { describe, it, expect } from "vitest";
import { urlBase64ToUint8Array } from "./notifications";

// urlBase64ToUint8Array converts a URL-safe base64 string (used for VAPID keys)
// to a Uint8Array. It must handle padding and URL-safe character substitution.

describe("urlBase64ToUint8Array", () => {
  it("converts a known value correctly", () => {
    // "hello" in standard base64 is "aGVsbG8="
    // URL-safe base64 without padding: "aGVsbG8"
    const result = urlBase64ToUint8Array("aGVsbG8");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(result)).toBe("hello");
  });

  it("round-trips: Uint8Array → base64url → Uint8Array", () => {
    const original = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const b64 = btoa(String.fromCharCode(...original))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
    const result = urlBase64ToUint8Array(b64);
    expect(result).toEqual(original);
  });

  it("handles standard base64 with padding included", () => {
    // Standard base64 with '=' padding should still work
    const result = urlBase64ToUint8Array("aGVsbG8=");
    expect(new TextDecoder().decode(result)).toBe("hello");
  });

  it("replaces '-' with '+' (URL-safe → standard base64)", () => {
    // 0xfb byte encodes to '+' in standard base64, '-' in URL-safe
    const withMinus = urlBase64ToUint8Array("-w");     // URL-safe
    const withPlus  = urlBase64ToUint8Array("+w");     // standard
    expect(withMinus).toEqual(withPlus);
  });

  it("replaces '_' with '/' (URL-safe → standard base64)", () => {
    // '/' in standard base64 becomes '_' in URL-safe
    const withUnderscore = urlBase64ToUint8Array("_w"); // URL-safe
    const withSlash      = urlBase64ToUint8Array("/w"); // standard
    expect(withUnderscore).toEqual(withSlash);
  });

  it("correctly pads when input length % 4 == 2 (needs 2 '=' chars)", () => {
    // "ab" in base64 without padding: "YWI" (length 3, % 4 == 3 → 1 padding)
    // "a"  in base64 without padding: "YQ"  (length 2, % 4 == 2 → 2 padding)
    const result = urlBase64ToUint8Array("YQ");
    expect(new TextDecoder().decode(result)).toBe("a");
  });

  it("correctly pads when input length % 4 == 3 (needs 1 '=' char)", () => {
    const result = urlBase64ToUint8Array("YWI");
    expect(new TextDecoder().decode(result)).toBe("ab");
  });

  it("no padding needed when input length % 4 == 0", () => {
    const result = urlBase64ToUint8Array("aGVs"); // "hel"
    expect(new TextDecoder().decode(result)).toBe("hel");
  });

  it("handles a realistic VAPID public key length (65 bytes → 88 base64url chars)", () => {
    // Generate 65 random bytes and encode as base64url
    const bytes = new Uint8Array(65);
    crypto.getRandomValues(bytes);
    const b64url = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
    const result = urlBase64ToUint8Array(b64url);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(65);
    expect(result).toEqual(bytes);
  });

  it("returns Uint8Array for empty string input", () => {
    const result = urlBase64ToUint8Array("");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(0);
  });
});
