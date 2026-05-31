import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db/server", () => ({ getDb: vi.fn() }));

import { NextRequest } from "next/server";
import { getDb } from "@/lib/db/server";
import { createTestDb } from "../_test-db";
import { sessions } from "@/lib/db/schema/server/sessions";
import { settings } from "@/lib/db/schema/server/settings";
import { GET, PUT } from "./route";

const mockGetDb = vi.mocked(getDb);
const SESSION   = "settings_test_session";

function authed(opts: { method?: string; body?: string; headers?: Record<string, string> } = {}): NextRequest {
  return new NextRequest("http://localhost/api/settings", {
    method: opts.method,
    body: opts.body,
    headers: { ...(opts.headers ?? {}), Cookie: `sid=${SESSION}` },
  });
}

function insertFullSettings() {
  getDb().insert(settings).values({
    id: "gleaned_settings",
    password_verifier: "$argon2id$v=19$secret",
    encryption_salt: "supersecret_salt",
    encryption_iterations: 600_000,
    language: "en",
    week_start: "sunday",
    theme: "dark",
    body_font: "serif",
    default_view: "calendar",
    auto_lock_after_minutes: 30,
    custom_entry_types: '["observation","insight"]',
    context_sources: '["book","article"]',
  }).run();
}

beforeEach(() => {
  mockGetDb.mockReturnValue(createTestDb() as ReturnType<typeof getDb>);
  getDb().insert(sessions).values({
    id: SESSION, created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  }).run();
});

// ─── Authentication ────────────────────────────────────────────────────────────

describe("GET /api/settings — auth", () => {
  it("returns 401 without a session cookie", () => {
    expect(GET(new NextRequest("http://localhost/api/settings")).status).toBe(401);
  });
});

describe("PUT /api/settings — auth", () => {
  it("returns 401 without a session cookie", async () => {
    const req = new NextRequest("http://localhost/api/settings", { method: "PUT" });
    expect((await PUT(req)).status).toBe(401);
  });
});

// ─── GET ──────────────────────────────────────────────────────────────────────

describe("GET /api/settings", () => {
  it("returns HTTP 200 with empty object when no settings row exists", async () => {
    const res = GET(authed());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  it("returns client-facing shape with all expected fields", async () => {
    insertFullSettings();
    const body = await GET(authed()).json() as Record<string, unknown>;
    expect(body.language).toBe("en");
    expect(body.weekStart).toBe("sunday");
    expect(body.theme).toBe("dark");
    expect(body.bodyFont).toBe("serif");
    expect(body.defaultView).toBe("calendar");
    expect(body.autoLockAfter).toBe(30);
    expect(body.customEntryTypes).toEqual(["observation", "insight"]);
    expect(body.contextSources).toEqual(["book", "article"]);
  });

  it("never exposes password_verifier in the response (security)", async () => {
    insertFullSettings();
    const body = await GET(authed()).json() as Record<string, unknown>;
    expect(body.password_verifier).toBeUndefined();
    expect(body.passwordVerifier).toBeUndefined();
  });

  it("never exposes encryption_salt in the response (security)", async () => {
    insertFullSettings();
    const body = await GET(authed()).json() as Record<string, unknown>;
    expect(body.encryption_salt).toBeUndefined();
    expect(body.encryptionSalt).toBeUndefined();
  });

  it("never exposes encryption_iterations in the response", async () => {
    insertFullSettings();
    const body = await GET(authed()).json() as Record<string, unknown>;
    expect(body.encryption_iterations).toBeUndefined();
    expect(body.encryptionIterations).toBeUndefined();
  });
});

// ─── PUT ──────────────────────────────────────────────────────────────────────

describe("PUT /api/settings", () => {
  it("returns 400 for non-object body", async () => {
    const req = authed({ method: "PUT", body: '"just a string"' });
    expect((await PUT(req)).status).toBe(400);
  });

  it("returns 400 when no valid fields are present in the update", async () => {
    const req = authed({
      method: "PUT",
      body: JSON.stringify({ unknown_field: "value" }),
    });
    expect((await PUT(req)).status).toBe(400);
  });

  it("returns 400 for invalid (non-JSON) body", async () => {
    const req = authed({ method: "PUT", body: "not json" });
    expect((await PUT(req)).status).toBe(400);
  });

  it("updates the language setting and returns the full settings object", async () => {
    insertFullSettings();
    const req = authed({
      method: "PUT",
      body: JSON.stringify({ language: "de" }),
    });
    const body = await (await PUT(req)).json() as Record<string, unknown>;
    expect(body.language).toBe("de");
  });

  it("creates the settings row if it does not exist yet", async () => {
    const req = authed({
      method: "PUT",
      body: JSON.stringify({ theme: "sepia" }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    const row = getDb().select().from(settings).get();
    expect(row?.theme).toBe("sepia");
  });

  it("persists customEntryTypes as a JSON array", async () => {
    const req = authed({
      method: "PUT",
      body: JSON.stringify({ customEntryTypes: ["concept", "quote"] }),
    });
    await PUT(req);
    const row = getDb().select().from(settings).get();
    expect(JSON.parse(row?.custom_entry_types ?? "[]")).toEqual(["concept", "quote"]);
  });

  it("does not overwrite other fields when updating only one", async () => {
    insertFullSettings();
    const req = authed({ method: "PUT", body: JSON.stringify({ theme: "light" }) });
    await PUT(req);
    const row = getDb().select().from(settings).get();
    expect(row?.language).toBe("en"); // unchanged
    expect(row?.theme).toBe("light"); // updated
  });

  it("never updates password_verifier or encryption_salt (fields ignored)", async () => {
    insertFullSettings();
    const req = authed({
      method: "PUT",
      // These fields are not in the allowed update set — toDb() ignores unknown keys
      body: JSON.stringify({ password_verifier: "hacked", encryption_salt: "hacked", theme: "light" }),
    });
    await PUT(req);
    const row = getDb().select().from(settings).get();
    expect(row?.password_verifier).toBe("$argon2id$v=19$secret"); // unchanged
    expect(row?.encryption_salt).toBe("supersecret_salt"); // unchanged
  });
});
