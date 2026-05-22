import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSettings, saveSettings } from "./settings";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("./client", () => ({
  getDB: vi.fn(),
}));

vi.mock("../crypto", () => ({
  loadKey:     vi.fn(async () => null),
  encryptText: vi.fn(async () => "enc-password"),
  decryptText: vi.fn(async () => "plaintext-password"),
}));

import { getDB } from "./client";
import { loadKey, decryptText } from "../crypto";

const mockGetDB    = vi.mocked(getDB);
const mockLoadKey  = vi.mocked(loadKey);
const mockDecrypt  = vi.mocked(decryptText);

function makeDB(overrides: {
  get?: (id: string) => Promise<unknown>;
  put?: (doc: unknown) => Promise<void>;
} = {}) {
  return {
    get: vi.fn().mockRejectedValue({ status: 404 }),
    put: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

const BASE_SETTINGS = {
  _id: "gleaned_settings",
  _rev: "1-abc",
  type: "settings",
  language: "de",
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── getSettings ─────────────────────────────────────────────────────────────

describe("getSettings", () => {
  it("returns null when no settings doc exists", async () => {
    const db = makeDB({ get: vi.fn().mockRejectedValue({ status: 404 }) });
    mockGetDB.mockResolvedValue(db as unknown as PouchDB.Database);

    expect(await getSettings()).toBeNull();
  });

  it("returns the settings doc when it exists", async () => {
    const db = makeDB({ get: vi.fn().mockResolvedValue(BASE_SETTINGS) });
    mockGetDB.mockResolvedValue(db as unknown as PouchDB.Database);

    const result = await getSettings();
    expect(result?.language).toBe("de");
  });

  it("does not attempt decryption when couchdbPasswordEnc is absent", async () => {
    const db = makeDB({ get: vi.fn().mockResolvedValue(BASE_SETTINGS) });
    mockGetDB.mockResolvedValue(db as unknown as PouchDB.Database);

    await getSettings();
    expect(mockDecrypt).not.toHaveBeenCalled();
  });

  it("decrypts couchdbPassword when couchdbPasswordEnc is set and key is available", async () => {
    const fakeKey = { type: "secret" } as unknown as CryptoKey;
    mockLoadKey.mockResolvedValue(fakeKey);
    mockDecrypt.mockResolvedValue("my-couch-password");

    const doc = { ...BASE_SETTINGS, couchdbPasswordEnc: "enc-blob" };
    const db = makeDB({ get: vi.fn().mockResolvedValue(doc) });
    mockGetDB.mockResolvedValue(db as unknown as PouchDB.Database);

    const result = await getSettings();
    expect(result?.couchdbPassword).toBe("my-couch-password");
  });

  it("omits couchdbPassword when decryption throws (wrong key / corrupted)", async () => {
    const fakeKey = { type: "secret" } as unknown as CryptoKey;
    mockLoadKey.mockResolvedValue(fakeKey);
    mockDecrypt.mockRejectedValue(new Error("bad decrypt"));

    const doc = { ...BASE_SETTINGS, couchdbPasswordEnc: "corrupt-blob" };
    const db = makeDB({ get: vi.fn().mockResolvedValue(doc) });
    mockGetDB.mockResolvedValue(db as unknown as PouchDB.Database);

    const result = await getSettings();
    expect(result?.couchdbPassword).toBeUndefined();
  });

  it("omits couchdbPassword when no key is loaded", async () => {
    mockLoadKey.mockResolvedValue(null);

    const doc = { ...BASE_SETTINGS, couchdbPasswordEnc: "enc-blob" };
    const db = makeDB({ get: vi.fn().mockResolvedValue(doc) });
    mockGetDB.mockResolvedValue(db as unknown as PouchDB.Database);

    const result = await getSettings();
    expect(result?.couchdbPassword).toBeUndefined();
    expect(mockDecrypt).not.toHaveBeenCalled();
  });
});

// ─── saveSettings ─────────────────────────────────────────────────────────────

describe("saveSettings", () => {
  it("writes the provided fields to the DB", async () => {
    const db = makeDB();
    mockGetDB.mockResolvedValue(db as unknown as PouchDB.Database);

    await saveSettings({ language: "en", theme: "dark" });

    expect(db.put).toHaveBeenCalledOnce();
    const saved = (db.put.mock.calls[0][0] as Record<string, unknown>);
    expect(saved.language).toBe("en");
    expect(saved.theme).toBe("dark");
  });

  it("never stores couchdbPassword as plaintext", async () => {
    const fakeKey = { type: "secret" } as unknown as CryptoKey;
    mockLoadKey.mockResolvedValue(fakeKey);

    const db = makeDB();
    mockGetDB.mockResolvedValue(db as unknown as PouchDB.Database);

    await saveSettings({ couchdbPassword: "secret123" } as Parameters<typeof saveSettings>[0]);

    const saved = (db.put.mock.calls[0][0] as Record<string, unknown>);
    expect(saved.couchdbPassword).toBeUndefined();
  });

  it("stores couchdbPasswordEnc when a key is available", async () => {
    const fakeKey = { type: "secret" } as unknown as CryptoKey;
    mockLoadKey.mockResolvedValue(fakeKey);

    const db = makeDB();
    mockGetDB.mockResolvedValue(db as unknown as PouchDB.Database);

    await saveSettings({ couchdbPassword: "secret123" } as Parameters<typeof saveSettings>[0]);

    const saved = (db.put.mock.calls[0][0] as Record<string, unknown>);
    expect(saved.couchdbPasswordEnc).toBe("enc-password");
  });

  it("merges new fields onto the existing doc (read-modify-write)", async () => {
    const existing = { _id: "gleaned_settings", _rev: "2-xyz", type: "settings", language: "de" };
    const db = makeDB({ get: vi.fn().mockResolvedValue(existing) });
    mockGetDB.mockResolvedValue(db as unknown as PouchDB.Database);

    await saveSettings({ theme: "sepia" });

    const saved = (db.put.mock.calls[0][0] as Record<string, unknown>);
    expect(saved.language).toBe("de");
    expect(saved.theme).toBe("sepia");
    expect(saved._rev).toBe("2-xyz");
  });

  it("retries up to 5 times on 409 conflict then throws", async () => {
    const db = makeDB({
      put: vi.fn().mockRejectedValue({ status: 409 }),
    });
    mockGetDB.mockResolvedValue(db as unknown as PouchDB.Database);

    await expect(saveSettings({ language: "en" })).rejects.toThrow("too many conflicts");
    expect(db.put).toHaveBeenCalledTimes(5);
  });

  it("propagates non-409 errors immediately without retrying", async () => {
    const db = makeDB({
      put: vi.fn().mockRejectedValue({ status: 500, message: "internal error" }),
    });
    mockGetDB.mockResolvedValue(db as unknown as PouchDB.Database);

    await expect(saveSettings({ language: "en" })).rejects.toMatchObject({ status: 500 });
    expect(db.put).toHaveBeenCalledTimes(1);
  });
});
