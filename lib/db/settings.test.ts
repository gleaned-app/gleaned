import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSettings, saveSettings } from "./settings";

vi.mock("../api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../api-client";
const mockApiFetch = vi.mocked(apiFetch);

function makeResponse(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

beforeEach(() => vi.clearAllMocks());

describe("getSettings", () => {
  it("returns settings from the API", async () => {
    mockApiFetch.mockResolvedValue(makeResponse({ language: "de", theme: "dark" }));
    const s = await getSettings();
    expect(s?.language).toBe("de");
    expect(s?.theme).toBe("dark");
  });

  it("returns null when the API response is not ok", async () => {
    mockApiFetch.mockResolvedValue(makeResponse({}, 404));
    expect(await getSettings()).toBeNull();
  });

  it("returns null when apiFetch throws", async () => {
    mockApiFetch.mockRejectedValue(new Error("network"));
    expect(await getSettings()).toBeNull();
  });
});

describe("saveSettings", () => {
  it("sends a PUT request with the settings body", async () => {
    mockApiFetch.mockResolvedValue(makeResponse({ language: "en" }));
    await saveSettings({ language: "en" });
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/settings",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("strips couchdb fields before sending", async () => {
    mockApiFetch.mockResolvedValue(makeResponse({ language: "en" }));
    await saveSettings({ language: "en", couchdbUrl: "http://localhost:5984" });
    const body = JSON.parse((mockApiFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body).not.toHaveProperty("couchdbUrl");
    expect(body).toHaveProperty("language", "en");
  });

  it("is a no-op when only couchdb fields are provided", async () => {
    await saveSettings({ couchdbUrl: "x", couchdbUsername: "y" });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("is a no-op when called with an empty object", async () => {
    await saveSettings({});
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
