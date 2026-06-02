import { describe, it, expect, vi, beforeEach } from "vitest";
import { webcrypto } from "crypto";

// Provide WebCrypto in Node environment.
Object.defineProperty(globalThis, "crypto", { value: webcrypto, writable: false });

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@simplewebauthn/browser", () => ({
  startRegistration:     vi.fn(),
  startAuthentication:   vi.fn(),
  browserSupportsWebAuthn: vi.fn(() => true),
}));

vi.mock("./api-client", () => ({
  apiFetch: vi.fn(),
}));

import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { apiFetch } from "./api-client";
import {
  detectDeviceName,
  aaguidToName,
  _prfToWrappingKey,
  _wrapKey,
  _unwrapKey,
  registerWebAuthn,
  loginWithBiometrics,
  hasWebAuthnCredential,
  listWebAuthnCredentials,
  deleteWebAuthnCredential,
} from "./webauthn-client";
import { deriveKey, generateSalt } from "./crypto";

const mockStartRegistration   = vi.mocked(startRegistration);
const mockStartAuthentication = vi.mocked(startAuthentication);
const mockApiFetch            = vi.mocked(apiFetch);

beforeEach(() => vi.clearAllMocks());

// ─── detectDeviceName ─────────────────────────────────────────────────────────

describe("detectDeviceName", () => {
  function withUA(ua: string) {
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: ua, userAgentData: undefined },
      writable: true, configurable: true,
    });
  }

  it("detects iPhone", () => {
    withUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)");
    expect(detectDeviceName()).toBe("iPhone");
  });

  it("detects iPad", () => {
    withUA("Mozilla/5.0 (iPad; CPU OS 17_0)");
    expect(detectDeviceName()).toBe("iPad");
  });

  it("detects Mac", () => {
    withUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
    expect(detectDeviceName()).toBe("Mac");
  });

  it("detects Android", () => {
    withUA("Mozilla/5.0 (Linux; Android 14; Pixel 8)");
    expect(detectDeviceName()).toBe("Android");
  });

  it("detects Windows", () => {
    withUA("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    expect(detectDeviceName()).toBe("Windows");
  });

  it("returns empty string for unknown UA", () => {
    withUA("UnknownBrowser/1.0");
    expect(detectDeviceName()).toBe("");
  });
});

// ─── aaguidToName ─────────────────────────────────────────────────────────────

describe("aaguidToName", () => {
  it("returns null for all-zeros AAGUID (no attestation)", () => {
    expect(aaguidToName("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(aaguidToName("")).toBeNull();
  });

  it("recognises Chrome Touch ID on Mac", () => {
    expect(aaguidToName("adce0002-35bc-c60a-648b-0b25f1f05503")).toBe("Chrome Touch ID (Mac)");
  });

  it("recognises Windows Hello Hardware", () => {
    expect(aaguidToName("08987058-cadc-4b81-b6e1-30de50dcbe96")).toBe("Windows Hello (Hardware)");
  });

  it("returns null for unknown AAGUID", () => {
    expect(aaguidToName("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(aaguidToName("ADCE0002-35BC-C60A-648B-0B25F1F05503")).toBe("Chrome Touch ID (Mac)");
  });
});

// ─── PRF key wrap / unwrap roundtrip ─────────────────────────────────────────

describe("PRF crypto roundtrip", () => {
  async function makeAesKey(): Promise<CryptoKey> {
    return deriveKey("test-password", generateSalt());
  }

  function fakePrfOutput(): ArrayBuffer {
    return webcrypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer;
  }

  it("wraps and unwraps a key with the same PRF output", async () => {
    const originalKey  = await makeAesKey();
    const prfOutput    = fakePrfOutput();
    const wrappingKey  = await _prfToWrappingKey(prfOutput);
    const blob         = await _wrapKey(originalKey, wrappingKey);

    // blob must be a non-empty base64 string
    expect(typeof blob).toBe("string");
    expect(blob.length).toBeGreaterThan(20);

    const recoveredKey = await _unwrapKey(blob, wrappingKey);

    // Verify the recovered key can round-trip data with the original key's material.
    const iv        = webcrypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode("gleaned-roundtrip-test");

    const ciphertext = await webcrypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      originalKey,
      plaintext,
    );
    const decrypted = await webcrypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      recoveredKey,
      ciphertext,
    );
    expect(new TextDecoder().decode(decrypted)).toBe("gleaned-roundtrip-test");
  });

  it("two different PRF outputs produce different wrapping keys", async () => {
    const key       = await makeAesKey();
    const prf1      = fakePrfOutput();
    const prf2      = fakePrfOutput();
    const wk1       = await _prfToWrappingKey(prf1);
    const wk2       = await _prfToWrappingKey(prf2);

    const blob = await _wrapKey(key, wk1);

    // Unwrapping with a different key must fail.
    await expect(_unwrapKey(blob, wk2)).rejects.toThrow();
  });

  it("a tampered blob cannot be unwrapped", async () => {
    const key        = await makeAesKey();
    const prfOutput  = fakePrfOutput();
    const wk         = await _prfToWrappingKey(prfOutput);
    const blob       = await _wrapKey(key, wk);

    // Flip a byte in the middle of the base64-decoded blob.
    const bytes      = Uint8Array.from(atob(blob), (c) => c.charCodeAt(0));
    bytes[bytes.length >> 1] ^= 0xff;
    const tampered   = btoa(String.fromCharCode(...bytes));

    await expect(_unwrapKey(tampered, wk)).rejects.toThrow();
  });
});

// ─── registerWebAuthn ─────────────────────────────────────────────────────────

describe("registerWebAuthn", () => {
  const fakePrfOutput = webcrypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer;

  function fakeCredential(prfFirst: ArrayBuffer | null = fakePrfOutput) {
    return {
      id: "cred-id-123",
      rawId: "cred-id-123",
      response: { clientDataJSON: btoa(JSON.stringify({ challenge: "test-challenge" })) },
      clientExtensionResults: prfFirst
        ? { prf: { results: { first: prfFirst } } }
        : {},
      type: "public-key",
    };
  }

  async function makeKey() {
    return deriveKey("password", generateSalt());
  }

  it("returns ok:true and resolves a device name on success", async () => {
    const key = await makeKey();

    mockApiFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ challenge: "test-challenge", extensions: { prf: { eval: { first: "base64salt" } } } }) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, aaguid: "adce0002-35bc-c60a-648b-0b25f1f05503" }) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true } as unknown as Response); // PATCH device name

    mockStartRegistration.mockResolvedValueOnce(fakeCredential() as never);

    const result = await registerWebAuthn(key, "");
    expect(result.ok).toBe(true);
    if (result.ok) {
      // AAGUID should have been resolved
      expect(result.resolvedDeviceName).toBe("Chrome Touch ID (Mac)");
    }
  });

  it("returns prf_unsupported when PRF is not in the credential response", async () => {
    const key = await makeKey();

    mockApiFetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ challenge: "c", extensions: {} }),
    } as unknown as Response);

    mockStartRegistration.mockResolvedValueOnce(fakeCredential(null) as never);

    const result = await registerWebAuthn(key, "My Mac");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("prf_unsupported");
  });

  it("returns cancelled when NotAllowedError is thrown", async () => {
    const key = await makeKey();

    mockApiFetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ challenge: "c", extensions: {} }),
    } as unknown as Response);

    const err = Object.assign(new Error("Not allowed"), { name: "NotAllowedError" });
    mockStartRegistration.mockRejectedValueOnce(err);

    const result = await registerWebAuthn(key, "Mac");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("cancelled");
  });

  it("returns unknown error when /start fetch fails", async () => {
    const key = await makeKey();
    mockApiFetch.mockResolvedValueOnce({ ok: false, text: async () => "server error" } as unknown as Response);

    const result = await registerWebAuthn(key, "Mac");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("unknown");
  });
});

// ─── loginWithBiometrics full roundtrip ──────────────────────────────────────

describe("loginWithBiometrics", () => {
  it("recovers the original AES key via PRF roundtrip", async () => {
    // 1. Produce a real keyBlob using the registration crypto path.
    const originalKey  = await deriveKey("secret", generateSalt());
    const prfOutput    = webcrypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer;
    const wrappingKey  = await _prfToWrappingKey(prfOutput);
    const keyBlob      = await _wrapKey(originalKey, wrappingKey);

    // 2. Mock /auth/start + /auth/finish (returns the blob) + fake assertion with same PRF output.
    const fakeAssertion = {
      id: "cred-id-123",
      response: { clientDataJSON: btoa(JSON.stringify({ challenge: "auth-challenge" })) },
      clientExtensionResults: { prf: { results: { first: prfOutput } } },
    };

    mockApiFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ challenge: "auth-challenge", extensions: { prf: {} } }) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, keyBlob }) } as unknown as Response);

    mockStartAuthentication.mockResolvedValueOnce(fakeAssertion as never);

    const result = await loginWithBiometrics();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 3. Verify the recovered key is functionally identical to the original.
    const iv        = webcrypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode("hello gleaned");
    const ciphertext = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, originalKey, plaintext);
    const decrypted  = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv }, result.key, ciphertext);
    expect(new TextDecoder().decode(decrypted)).toBe("hello gleaned");
  });

  it("returns no_credentials when /start returns 404", async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: false, status: 404 } as unknown as Response);
    const result = await loginWithBiometrics();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("no_credentials");
  });

  it("returns cancelled on NotAllowedError", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ challenge: "c", extensions: {} }),
    } as unknown as Response);
    const err = Object.assign(new Error("Not allowed"), { name: "NotAllowedError" });
    mockStartAuthentication.mockRejectedValueOnce(err);

    const result = await loginWithBiometrics();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("cancelled");
  });

  it("returns prf_unsupported when PRF output is missing in assertion", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ challenge: "c", extensions: {} }),
    } as unknown as Response);

    mockStartAuthentication.mockResolvedValueOnce({
      id: "x",
      response: { clientDataJSON: btoa(JSON.stringify({ challenge: "c" })) },
      clientExtensionResults: {},
    } as never);

    const result = await loginWithBiometrics();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("prf_unsupported");
  });
});

// ─── credential list / delete helpers ────────────────────────────────────────

describe("credential helpers", () => {
  const creds = [
    { id: "a", device_name: "Mac", created_at: "2026-01-01T00:00:00Z" },
    { id: "b", device_name: "iPhone", created_at: "2026-01-02T00:00:00Z" },
  ];

  it("hasWebAuthnCredential returns true when credentials exist", async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: true, json: async () => creds } as unknown as Response);
    expect(await hasWebAuthnCredential()).toBe(true);
  });

  it("hasWebAuthnCredential returns false for empty list", async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: true, json: async () => [] } as unknown as Response);
    expect(await hasWebAuthnCredential()).toBe(false);
  });

  it("hasWebAuthnCredential returns false on fetch error", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("network"));
    expect(await hasWebAuthnCredential()).toBe(false);
  });

  it("listWebAuthnCredentials returns the credential list", async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: true, json: async () => creds } as unknown as Response);
    expect(await listWebAuthnCredentials()).toEqual(creds);
  });

  it("listWebAuthnCredentials returns empty array on error", async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: false } as unknown as Response);
    expect(await listWebAuthnCredentials()).toEqual([]);
  });

  it("deleteWebAuthnCredential returns true on success", async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: true } as unknown as Response);
    expect(await deleteWebAuthnCredential("a")).toBe(true);

    const call = mockApiFetch.mock.calls[0];
    expect(call[0]).toBe("/api/webauthn/credentials");
    expect(JSON.parse((call[1] as RequestInit).body as string)).toMatchObject({ id: "a" });
  });

  it("deleteWebAuthnCredential returns false on server error", async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: false } as unknown as Response);
    expect(await deleteWebAuthnCredential("a")).toBe(false);
  });
});
