import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db/server", () => ({ getDb: vi.fn() }));

import { NextRequest } from "next/server";
import { getDb } from "@/lib/db/server";
import { createTestDb } from "../../_test-db";
import { sessions } from "@/lib/db/schema/server/sessions";
import { webauthnCredentials } from "@/lib/db/schema/server/webauthn";
import { auditLog } from "@/lib/db/schema/server/audit_log";
import { GET, PATCH, DELETE } from "./route";

const mockGetDb = vi.mocked(getDb);
const SESSION   = "creds_test_session";
const CRED_ID   = "test-credential-id";

function req(method: string, body?: unknown, authed = true): NextRequest {
  const cookie = authed ? `sid=${SESSION}` : "";
  return new NextRequest("http://localhost/api/webauthn/credentials", {
    method,
    headers: { Cookie: cookie, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function seedCredential(db: ReturnType<typeof getDb>): void {
  db.insert(webauthnCredentials).values({
    id:          CRED_ID,
    public_key:  "fakepubkey",
    sign_count:  0,
    device_name: "Test MacBook",
    key_blob:    "fakekeyblob",
    created_at:  "2026-01-01T00:00:00.000Z",
  }).run();
}

beforeEach(() => {
  mockGetDb.mockReturnValue(createTestDb() as ReturnType<typeof getDb>);
  getDb().insert(sessions).values({
    id:         SESSION,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  }).run();
});

// ─── GET ───────────────────────────────────────────────────────────────────────

describe("GET /api/webauthn/credentials — auth", () => {
  it("returns 401 without a session cookie", async () => {
    expect((await GET(req("GET", undefined, false))).status).toBe(401);
  });
});

describe("GET /api/webauthn/credentials", () => {
  it("returns an empty array when no credentials exist", async () => {
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns credential metadata without key_blob or public_key", async () => {
    seedCredential(getDb());
    const res  = await GET(req("GET"));
    const body = await res.json() as Record<string, unknown>[];
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(CRED_ID);
    expect(body[0].device_name).toBe("Test MacBook");
    expect(body[0]).not.toHaveProperty("key_blob");
    expect(body[0]).not.toHaveProperty("public_key");
  });
});

// ─── PATCH ────────────────────────────────────────────────────────────────────

describe("PATCH /api/webauthn/credentials — auth", () => {
  it("returns 401 without a session cookie", async () => {
    expect((await PATCH(req("PATCH", { id: CRED_ID, deviceName: "X" }, false))).status).toBe(401);
  });
});

describe("PATCH /api/webauthn/credentials — body validation", () => {
  it("returns 400 when id is missing", async () => {
    expect((await PATCH(req("PATCH", { deviceName: "X" }))).status).toBe(400);
  });

  it("returns 400 when deviceName is missing", async () => {
    expect((await PATCH(req("PATCH", { id: CRED_ID }))).status).toBe(400);
  });

  it("returns 400 on non-object body", async () => {
    expect((await PATCH(req("PATCH", "bad"))).status).toBe(400);
  });
});

describe("PATCH /api/webauthn/credentials", () => {
  it("updates device_name and returns ok", async () => {
    seedCredential(getDb());
    const res = await PATCH(req("PATCH", { id: CRED_ID, deviceName: "New Name" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    const row = getDb().select().from(webauthnCredentials).all()[0];
    expect(row.device_name).toBe("New Name");
  });

  it("truncates deviceName to 64 characters", async () => {
    seedCredential(getDb());
    await PATCH(req("PATCH", { id: CRED_ID, deviceName: "x".repeat(100) }));
    const row = getDb().select().from(webauthnCredentials).all()[0];
    expect(row.device_name.length).toBe(64);
  });
});

// ─── DELETE ───────────────────────────────────────────────────────────────────

describe("DELETE /api/webauthn/credentials — auth", () => {
  it("returns 401 without a session cookie", async () => {
    expect((await DELETE(req("DELETE", { id: CRED_ID }, false))).status).toBe(401);
  });
});

describe("DELETE /api/webauthn/credentials — body validation", () => {
  it("returns 400 when id is missing", async () => {
    expect((await DELETE(req("DELETE", {}))).status).toBe(400);
  });

  it("returns 400 on non-object body", async () => {
    expect((await DELETE(req("DELETE", "bad"))).status).toBe(400);
  });
});

describe("DELETE /api/webauthn/credentials", () => {
  it("returns 404 when credential does not exist", async () => {
    const res = await DELETE(req("DELETE", { id: "nonexistent" }));
    expect(res.status).toBe(404);
  });

  it("deletes the credential and returns ok", async () => {
    seedCredential(getDb());
    const res = await DELETE(req("DELETE", { id: CRED_ID }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(getDb().select().from(webauthnCredentials).all()).toHaveLength(0);
  });

  it("writes an audit log entry on successful revocation", async () => {
    seedCredential(getDb());
    await DELETE(req("DELETE", { id: CRED_ID }));
    const logs = getDb().select().from(auditLog).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("webauthn.credential.revoked");
    const detail = JSON.parse(logs[0].detail);
    expect(detail.credential_id).toBe(CRED_ID);
    expect(detail.device_name).toBe("Test MacBook");
    expect(detail.session_id).toBe(SESSION);
  });

  it("does not write an audit log entry when credential is not found", async () => {
    await DELETE(req("DELETE", { id: "nonexistent" }));
    expect(getDb().select().from(auditLog).all()).toHaveLength(0);
  });
});
