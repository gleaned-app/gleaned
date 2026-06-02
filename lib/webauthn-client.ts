"use client";

import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser";
import { apiFetch } from "./api-client";
import { bytesToBase64 } from "./crypto";

export { browserSupportsWebAuthn };

// Known AAGUID → human-readable authenticator name.
// AAGUIDs are UUIDs embedded in the authenticator data during registration.
const AAGUID_NAMES: Record<string, string> = {
  "adce0002-35bc-c60a-648b-0b25f1f05503": "Chrome Touch ID (Mac)",
  "08987058-cadc-4b81-b6e1-30de50dcbe96": "Windows Hello (Hardware)",
  "9ddd1817-af5a-4672-a2b9-3e3dd95000a9": "Windows Hello (VBS)",
  "fbfc3007-154e-4ecc-8c0b-6e020557d7bd": "Windows Hello (Software)",
  "6028b017-b1d4-4c02-b4b3-afcdafc96bb2": "Windows Hello (Hardware)",
  "b93fd961-f2e6-462f-b122-82002247de78": "Android Authenticator",
  "de1e552d-db1d-4423-a619-d6df31a3d8be": "Microsoft Authenticator",
  "dd4ec289-e01d-41c9-bb89-70fa845d4bf2": "iCloud Passkey",
};

// Detect a human-readable device name from the User-Agent string.
// Used to pre-populate the device name field during registration.
export function detectDeviceName(): string {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua))                return "iPhone";
  if (/iPad/.test(ua))                  return "iPad";
  if (/Android/.test(ua))              return "Android";
  if (/Mac OS X/.test(ua) && !/iPhone|iPad/.test(ua)) {
    // Try to distinguish model from userAgentData
    const uad = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
    if (uad?.platform) return uad.platform;
    return "Mac";
  }
  if (/Windows/.test(ua))              return "Windows";
  if (/Linux/.test(ua))                return "Linux";
  return "";
}

export function aaguidToName(aaguid: string): string | null {
  if (!aaguid || aaguid === "00000000-0000-0000-0000-000000000000") return null;
  return AAGUID_NAMES[aaguid.toLowerCase()] ?? null;
}

const PRF_SALT = new TextEncoder().encode("gleaned-key-wrap-v1");

// Exported for unit tests — not part of the public API.
export async function _prfToWrappingKey(prfOutput: ArrayBuffer): Promise<CryptoKey> {
  return prfToWrappingKey(prfOutput);
}
export async function _wrapKey(encKey: CryptoKey, wrappingKey: CryptoKey): Promise<string> {
  return wrapKey(encKey, wrappingKey);
}
export async function _unwrapKey(blob: string, wrappingKey: CryptoKey): Promise<CryptoKey> {
  return unwrapKey(blob, wrappingKey);
}

// Derive a 256-bit AES-GCM wrapping key from the 32-byte PRF output via HKDF.
async function prfToWrappingKey(prfOutput: ArrayBuffer): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey("raw", prfOutput, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode("gleaned-wrap") },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

// Wrap the user's AES-GCM encryption key and return a base64 blob.
async function wrapKey(encKey: CryptoKey, wrappingKey: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.wrapKey("jwk", encKey, wrappingKey, { name: "AES-GCM", iv });
  const combined = new Uint8Array(12 + wrapped.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(wrapped), 12);
  return bytesToBase64(combined);
}

// Unwrap the blob back into a usable CryptoKey.
async function unwrapKey(blob: string, wrappingKey: CryptoKey): Promise<CryptoKey> {
  const combined = Uint8Array.from(atob(blob), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const wrapped = combined.slice(12);
  return crypto.subtle.unwrapKey(
    "jwk",
    wrapped,
    wrappingKey,
    { name: "AES-GCM", iv },
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

function getPrfOutput(result: Awaited<ReturnType<typeof startRegistration>>): ArrayBuffer | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ext = (result as any).clientExtensionResults as Record<string, unknown> | undefined;
  const first = (ext?.prf as { results?: { first?: unknown } } | undefined)?.results?.first;
  if (first instanceof ArrayBuffer) return first;
  return null;
}

function getPrfOutputFromAuth(result: Awaited<ReturnType<typeof startAuthentication>>): ArrayBuffer | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ext = (result as any).clientExtensionResults as Record<string, unknown> | undefined;
  const first = (ext?.prf as { results?: { first?: unknown } } | undefined)?.results?.first;
  if (first instanceof ArrayBuffer) return first;
  return null;
}

export type RegisterWebAuthnResult =
  | { ok: true; resolvedDeviceName: string }
  | { ok: false; error: "prf_unsupported" | "cancelled" | "unknown"; message?: string };

// Called after a successful password login — registers a biometric credential
// and wraps the current session key with the PRF output.
export async function registerWebAuthn(
  currentKey: CryptoKey,
  deviceName: string,
): Promise<RegisterWebAuthnResult> {
  try {
    const startRes = await apiFetch("/api/webauthn/register/start", { method: "POST" });
    if (!startRes.ok) return { ok: false, error: "unknown", message: await startRes.text() };
    const options = await startRes.json();

    // Inject PRF salt (server sends base64, browser library expects the options as-is).
    // The PRF eval salt must be an ArrayBuffer for the browser API.
    if (options.extensions?.prf?.eval?.first) {
      options.extensions.prf.eval.first = PRF_SALT.buffer as ArrayBuffer;
    }

    const credential = await startRegistration({ optionsJSON: options });

    const prfOutput = getPrfOutput(credential);
    if (!prfOutput) return { ok: false, error: "prf_unsupported" };

    const wrappingKey = await prfToWrappingKey(prfOutput);
    const keyBlob = await wrapKey(currentKey, wrappingKey);

    const finishRes = await apiFetch("/api/webauthn/register/finish", {
      method: "POST",
      body: JSON.stringify({ credential, keyBlob, deviceName }),
    });

    if (!finishRes.ok) return { ok: false, error: "unknown", message: await finishRes.text() };

    // Resolve the best display name: user input → AAGUID lookup → UA detection → fallback
    const finishData = await finishRes.json() as { ok: boolean; aaguid?: string | null };
    const resolvedDeviceName =
      deviceName ||
      (finishData.aaguid ? aaguidToName(finishData.aaguid) : null) ||
      detectDeviceName() ||
      "Unknown device";

    // If the server stored an empty device_name (because user didn't type one),
    // patch it now that we have a better name.
    if (!deviceName && resolvedDeviceName) {
      await apiFetch("/api/webauthn/credentials", {
        method: "PATCH",
        body: JSON.stringify({ id: credential.id, deviceName: resolvedDeviceName }),
      }).catch(() => { /* best-effort */ });
    }

    return { ok: true, resolvedDeviceName };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "NotAllowedError") {
      return { ok: false, error: "cancelled" };
    }
    return { ok: false, error: "unknown", message: String(err) };
  }
}

export type BiometricLoginResult =
  | { ok: true; key: CryptoKey }
  | { ok: false; error: "no_credentials" | "prf_unsupported" | "cancelled" | "unknown"; message?: string };

// Called on the lock screen instead of password login.
export async function loginWithBiometrics(): Promise<BiometricLoginResult> {
  try {
    const startRes = await apiFetch("/api/webauthn/auth/start", { method: "POST" });
    if (!startRes.ok) {
      if (startRes.status === 404) return { ok: false, error: "no_credentials" };
      return { ok: false, error: "unknown", message: await startRes.text() };
    }
    const options = await startRes.json();

    if (options.extensions?.prf?.eval?.first) {
      options.extensions.prf.eval.first = PRF_SALT.buffer as ArrayBuffer;
    }

    const credential = await startAuthentication({ optionsJSON: options });

    const prfOutput = getPrfOutputFromAuth(credential);
    if (!prfOutput) return { ok: false, error: "prf_unsupported" };

    const finishRes = await apiFetch("/api/webauthn/auth/finish", {
      method: "POST",
      body: JSON.stringify({ credential }),
    });

    if (!finishRes.ok) return { ok: false, error: "unknown", message: await finishRes.text() };
    const { keyBlob } = await finishRes.json() as { keyBlob: string };

    const wrappingKey = await prfToWrappingKey(prfOutput);
    const key = await unwrapKey(keyBlob, wrappingKey);
    return { ok: true, key };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "NotAllowedError") {
      return { ok: false, error: "cancelled" };
    }
    return { ok: false, error: "unknown", message: String(err) };
  }
}

export interface WebAuthnCredentialInfo {
  id: string;
  device_name: string;
  created_at: string;
}

export async function listWebAuthnCredentials(): Promise<WebAuthnCredentialInfo[]> {
  const res = await apiFetch("/api/webauthn/credentials");
  if (!res.ok) return [];
  return res.json();
}

export async function deleteWebAuthnCredential(id: string): Promise<boolean> {
  const res = await apiFetch("/api/webauthn/credentials", {
    method: "DELETE",
    body: JSON.stringify({ id }),
  });
  return res.ok;
}

// True if at least one credential is registered on this server.
export async function hasWebAuthnCredential(): Promise<boolean> {
  const res = await apiFetch("/api/webauthn/credentials").catch(() => null);
  if (!res?.ok) return false;
  const rows = await res.json() as WebAuthnCredentialInfo[];
  return rows.length > 0;
}
