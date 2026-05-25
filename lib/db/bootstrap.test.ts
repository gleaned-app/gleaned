import { describe, it, expect, vi, beforeEach } from "vitest";
import { bootstrapFromCouchDB } from "./bootstrap";

const mockPut = vi.fn();
const mockGet = vi.fn();

vi.mock("./client", () => ({
  getDB: () => Promise.resolve({ put: mockPut, get: mockGet }),
}));

const REMOTE_DOC = {
  _id: "gleaned_settings",
  _rev: "1-abc",
  type: "settings",
  encryptionSalt: "dGVzdHNhbHQ=",
  encryptionVerification: "enc-verification-blob",
  encryptionIterations: 600000,
};

function mockFetch(status: number, body?: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPut.mockResolvedValue({});
});

describe("bootstrapFromCouchDB", () => {
  describe("success", () => {
    it("returns 'ok' and stores the settings doc without _rev", async () => {
      mockFetch(200, REMOTE_DOC);
      const result = await bootstrapFromCouchDB("http://localhost:5984/gleaned", "admin", "pw");
      expect(result).toBe("ok");
      expect(mockPut).toHaveBeenCalledOnce();
      const stored = mockPut.mock.calls[0][0] as Record<string, unknown>;
      expect(stored._rev).toBeUndefined();
      expect(stored.encryptionSalt).toBe(REMOTE_DOC.encryptionSalt);
      expect(stored._id).toBe("gleaned_settings");
    });

    it("sends credentials as Authorization header when username is provided", async () => {
      mockFetch(200, REMOTE_DOC);
      await bootstrapFromCouchDB("http://localhost:5984/gleaned", "admin", "s3cr3t");
      const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
      expect(url).not.toContain("admin");
      expect(url).not.toContain("s3cr3t");
      const auth = (options?.headers as Record<string, string>)?.["Authorization"] ?? "";
      expect(auth).toBe("Basic " + btoa("admin:s3cr3t"));
    });

    it("works without credentials when username is empty", async () => {
      mockFetch(200, REMOTE_DOC);
      const result = await bootstrapFromCouchDB("http://localhost:5984/gleaned", "", "");
      expect(result).toBe("ok");
      const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      // No @ means no embedded credentials
      expect(url).not.toContain("@");
    });

    it("strips trailing slash from the base URL before appending doc path", async () => {
      mockFetch(200, REMOTE_DOC);
      await bootstrapFromCouchDB("http://localhost:5984/gleaned/", "admin", "pw");
      const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).not.toContain("//gleaned_settings");
    });
  });

  describe("409 conflict — partial local doc exists", () => {
    it("retries put with the existing local _rev and returns 'ok'", async () => {
      mockFetch(200, REMOTE_DOC);
      mockPut.mockRejectedValueOnce({ status: 409 });
      mockGet.mockResolvedValue({ _id: "gleaned_settings", _rev: "2-local" });
      mockPut.mockResolvedValue({});

      const result = await bootstrapFromCouchDB("http://localhost:5984/gleaned", "admin", "pw");
      expect(result).toBe("ok");
      expect(mockPut).toHaveBeenCalledTimes(2);
      const retryCall = mockPut.mock.calls[1][0] as Record<string, unknown>;
      expect(retryCall._rev).toBe("2-local");
    });
  });

  describe("auth errors", () => {
    it("returns 'auth-error' on 401", async () => {
      mockFetch(401);
      expect(await bootstrapFromCouchDB("http://localhost:5984/gleaned", "admin", "wrong")).toBe("auth-error");
    });

    it("returns 'auth-error' on 403", async () => {
      mockFetch(403);
      expect(await bootstrapFromCouchDB("http://localhost:5984/gleaned", "admin", "wrong")).toBe("auth-error");
    });
  });

  describe("not-found cases", () => {
    it("returns 'not-found' on HTTP 404", async () => {
      mockFetch(404);
      expect(await bootstrapFromCouchDB("http://localhost:5984/gleaned", "admin", "pw")).toBe("not-found");
    });

    it("returns 'not-found' when doc has no encryptionSalt", async () => {
      mockFetch(200, { _id: "gleaned_settings", type: "settings" });
      expect(await bootstrapFromCouchDB("http://localhost:5984/gleaned", "admin", "pw")).toBe("not-found");
    });
  });

  describe("network errors", () => {
    it("returns 'network-error' when fetch throws", async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
      expect(await bootstrapFromCouchDB("http://localhost:5984/gleaned", "admin", "pw")).toBe("network-error");
    });

    it("returns 'network-error' on unexpected HTTP status", async () => {
      mockFetch(500);
      expect(await bootstrapFromCouchDB("http://localhost:5984/gleaned", "admin", "pw")).toBe("network-error");
    });

    it("returns 'network-error' for an invalid URL", async () => {
      expect(await bootstrapFromCouchDB("not a url", "admin", "pw")).toBe("network-error");
    });

    it("returns 'network-error' for an empty URL", async () => {
      expect(await bootstrapFromCouchDB("", "admin", "pw")).toBe("network-error");
    });
  });
});
