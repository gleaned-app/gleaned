import { describe, it, expect, beforeEach, vi } from "vitest";
import { isAuthenticated, logout, login, setupPassword, hasPassword } from "./auth";
import { getSettings, saveSettings } from "./db";
import { decryptText, storeKey, clearKey, PBKDF2_ITERATIONS } from "./crypto";

// ─── Mocks ────────────────────────────────────────────────────────────────────
// auth.ts imports from ./db (PouchDB) and ./crypto (SubtleCrypto).
// Both are mocked so tests stay pure and fast.

vi.mock("./db", () => ({
  getSettings:         vi.fn(),
  saveSettings:        vi.fn(),
  setDbAuthenticated:  vi.fn(),
}));

vi.mock("./crypto", () => ({
  PBKDF2_ITERATIONS: 600_000,
  deriveKey:    vi.fn(async () => ({ type: "secret" })),
  generateSalt: vi.fn(() => new Uint8Array(16)),
  saltToBase64: vi.fn(() => "base64salt"),
  base64ToSalt: vi.fn(() => new Uint8Array(16)),
  encryptText:  vi.fn(async () => "encrypted"),
  decryptText:  vi.fn(async () => "gleaned-v1"),
  storeKey:     vi.fn(),
  clearKey:     vi.fn(),
}));

const mockGetSettings  = vi.mocked(getSettings);
const mockSaveSettings = vi.mocked(saveSettings);
const mockDecryptText  = vi.mocked(decryptText);
const mockStoreKey     = vi.mocked(storeKey);
const mockClearKey     = vi.mocked(clearKey);

const SETTINGS_WITH_PASSWORD = {
  _id: "gleaned_settings" as const,
  type: "settings" as const,
  encryptionSalt: "base64salt",
  encryptionVerification: "encrypted",
  encryptionIterations: 600_000,
};

const SETTINGS_LEGACY = {
  _id: "gleaned_settings" as const,
  type: "settings" as const,
  encryptionSalt: "base64salt",
  encryptionVerification: "encrypted",
  // no encryptionIterations — simulates pre-v0.2 data
};

beforeEach(() => {
  // Reset the in-memory auth flag first, then clear mock call counts so that
  // the logout() call here doesn't pollute per-test mock assertions.
  logout();
  vi.clearAllMocks();
});

// ─── isAuthenticated ──────────────────────────────────────────────────────────

describe("isAuthenticated", () => {
  it("returns false on a fresh module state (no login has happened)", () => {
    expect(isAuthenticated()).toBe(false);
  });

  it("is purely in-memory: writing to sessionStorage has no effect", () => {
    // Security property: auth state must not be readable from sessionStorage.
    // A compromised sessionStorage entry must not bypass the lock screen.
    try {
      sessionStorage.setItem("gleaned_session", "1");
    } catch {
      // sessionStorage is unavailable in Node — that's fine; the point is that
      // auth.ts never reads it, so the test body below still holds.
    }
    expect(isAuthenticated()).toBe(false);
  });
});

// ─── login ───────────────────────────────────────────────────────────────────

describe("login", () => {
  it("returns true and sets isAuthenticated when password is correct", async () => {
    mockGetSettings.mockResolvedValue(SETTINGS_WITH_PASSWORD);
    mockDecryptText.mockResolvedValue("gleaned-v1");

    const result = await login("correctpassword");

    expect(result).toBe(true);
    expect(isAuthenticated()).toBe(true);
  });

  it("stores the derived key on successful login", async () => {
    mockGetSettings.mockResolvedValue(SETTINGS_WITH_PASSWORD);
    mockDecryptText.mockResolvedValue("gleaned-v1");

    await login("correctpassword");

    expect(mockStoreKey).toHaveBeenCalledOnce();
  });

  it("returns false and leaves isAuthenticated false when verification plaintext mismatches", async () => {
    mockGetSettings.mockResolvedValue(SETTINGS_WITH_PASSWORD);
    mockDecryptText.mockResolvedValue("wrong-verification-text");

    const result = await login("wrongpassword");

    expect(result).toBe(false);
    expect(isAuthenticated()).toBe(false);
  });

  it("returns false when decryptText throws (e.g. wrong password → AES-GCM auth fail)", async () => {
    mockGetSettings.mockResolvedValue(SETTINGS_WITH_PASSWORD);
    mockDecryptText.mockRejectedValue(new DOMException("bad decrypt", "OperationError"));

    const result = await login("wrongpassword");

    expect(result).toBe(false);
    expect(isAuthenticated()).toBe(false);
  });

  it("returns false when no password is set (missing encryptionSalt)", async () => {
    mockGetSettings.mockResolvedValue({
      _id: "gleaned_settings",
      type: "settings",
    });

    const result = await login("anypassword");

    expect(result).toBe(false);
    expect(isAuthenticated()).toBe(false);
  });

  it("returns false when getSettings returns null (first launch)", async () => {
    mockGetSettings.mockResolvedValue(null);

    const result = await login("anypassword");

    expect(result).toBe(false);
    expect(isAuthenticated()).toBe(false);
  });

  it("does not call storeKey on failed login", async () => {
    mockGetSettings.mockResolvedValue(SETTINGS_WITH_PASSWORD);
    mockDecryptText.mockRejectedValue(new Error("bad"));

    await login("bad");

    expect(mockStoreKey).not.toHaveBeenCalled();
  });

  it("silently upgrades PBKDF2 iterations when legacy settings have no encryptionIterations", async () => {
    mockGetSettings.mockResolvedValue(SETTINGS_LEGACY);
    mockSaveSettings.mockResolvedValue(undefined);
    mockDecryptText.mockResolvedValue("gleaned-v1");

    const result = await login("correctpassword");

    expect(result).toBe(true);
    expect(mockSaveSettings).toHaveBeenCalledOnce();
    const saved = mockSaveSettings.mock.calls[0][0];
    expect(saved).toHaveProperty("encryptionIterations", PBKDF2_ITERATIONS);
  });

  it("does not call saveSettings when encryptionIterations is already current", async () => {
    mockGetSettings.mockResolvedValue(SETTINGS_WITH_PASSWORD);
    mockDecryptText.mockResolvedValue("gleaned-v1");

    await login("correctpassword");

    expect(mockSaveSettings).not.toHaveBeenCalled();
  });
});

// ─── setupPassword ────────────────────────────────────────────────────────────

describe("setupPassword", () => {
  it("calls saveSettings with salt, verification ciphertext, and current PBKDF2 iterations", async () => {
    mockSaveSettings.mockResolvedValue(undefined);

    await setupPassword("newpassword");

    expect(mockSaveSettings).toHaveBeenCalledOnce();
    const arg = mockSaveSettings.mock.calls[0][0];
    expect(arg).toHaveProperty("encryptionSalt", "base64salt");
    expect(arg).toHaveProperty("encryptionVerification", "encrypted");
    expect(arg).toHaveProperty("encryptionIterations", PBKDF2_ITERATIONS);
  });

  it("stores the derived key after setup", async () => {
    mockSaveSettings.mockResolvedValue(undefined);

    await setupPassword("newpassword");

    expect(mockStoreKey).toHaveBeenCalledOnce();
  });

  it("sets isAuthenticated to true after successful setup", async () => {
    mockSaveSettings.mockResolvedValue(undefined);

    await setupPassword("newpassword");

    expect(isAuthenticated()).toBe(true);
  });
});

// ─── logout ───────────────────────────────────────────────────────────────────

describe("logout", () => {
  it("sets isAuthenticated to false after a successful login", async () => {
    mockGetSettings.mockResolvedValue(SETTINGS_WITH_PASSWORD);
    mockDecryptText.mockResolvedValue("gleaned-v1");
    await login("correctpassword");

    expect(isAuthenticated()).toBe(true);
    logout();
    expect(isAuthenticated()).toBe(false);
  });

  it("calls clearKey to wipe the encryption key from memory", () => {
    logout();
    expect(mockClearKey).toHaveBeenCalledOnce();
  });

  it("is safe to call when already logged out (no throw)", () => {
    expect(() => logout()).not.toThrow();
  });

  it("is idempotent: multiple logouts leave isAuthenticated false", () => {
    logout();
    logout();
    logout();
    expect(isAuthenticated()).toBe(false);
  });
});

// ─── hasPassword ─────────────────────────────────────────────────────────────

describe("hasPassword", () => {
  it("returns true when settings has encryptionSalt", async () => {
    mockGetSettings.mockResolvedValue(SETTINGS_WITH_PASSWORD);
    expect(await hasPassword()).toBe(true);
  });

  it("returns false when settings exists but has no encryptionSalt", async () => {
    mockGetSettings.mockResolvedValue({ _id: "gleaned_settings", type: "settings" });
    expect(await hasPassword()).toBe(false);
  });

  it("returns false when getSettings returns null", async () => {
    mockGetSettings.mockResolvedValue(null);
    expect(await hasPassword()).toBe(false);
  });

  it("returns false when encryptionSalt is an empty string", async () => {
    mockGetSettings.mockResolvedValue({
      _id: "gleaned_settings",
      type: "settings",
      encryptionSalt: "",
    });
    expect(await hasPassword()).toBe(false);
  });
});

// ─── brute-force resistance (auth layer) ─────────────────────────────────────

describe("brute-force resistance", () => {
  it("each failed login attempt keeps isAuthenticated false", async () => {
    mockGetSettings.mockResolvedValue(SETTINGS_WITH_PASSWORD);
    mockDecryptText.mockRejectedValue(new Error("bad"));

    for (let i = 0; i < 5; i++) {
      await login("wrong");
      expect(isAuthenticated()).toBe(false);
    }
  });

  it("correct login after failures succeeds", async () => {
    mockGetSettings.mockResolvedValue(SETTINGS_WITH_PASSWORD);
    mockDecryptText
      .mockRejectedValueOnce(new Error("bad"))
      .mockRejectedValueOnce(new Error("bad"))
      .mockResolvedValue("gleaned-v1");

    await login("wrong");
    await login("wrong");
    const result = await login("correct");

    expect(result).toBe(true);
    expect(isAuthenticated()).toBe(true);
  });
});
