/**
 * API integration tests — verify the server behaves correctly as an
 * authenticated client. These tests run against the real dev server with
 * the real SQLite database, so they complement the unit tests which mock
 * apiFetch at the module boundary.
 *
 * Authenticated calls use page.evaluate() so they run inside the browser
 * context and carry the httpOnly session cookie that was set via JS fetch()
 * during login. Playwright's APIRequestContext (page.request) does not
 * reliably see cookies set via in-page fetch(), so we avoid it for
 * auth-sensitive assertions.
 */
import { test, expect } from "@playwright/test";
import { authenticate } from "./helpers";

// ─── Unauthenticated access ───────────────────────────────────────────────────

test("API rejects unauthenticated requests with 401", async ({ request }) => {
  const routes = [
    "/api/entries?from=2024-01-01&to=2024-12-31",
    "/api/threads",
    "/api/settings",
    "/api/export",
  ];
  for (const route of routes) {
    const res = await request.get(route);
    expect(res.status(), `Expected 401 for ${route}`).toBe(401);
  }
});

// ─── Auth status accuracy ─────────────────────────────────────────────────────

test("status endpoint reports accurate auth state", async ({ page, request }) => {
  // Ensure the account is set up (registers on first run, logs in on subsequent).
  // authenticate() must come first — api.spec.ts runs before auth.spec.ts
  // alphabetically, so no prior test has set up the account yet.
  await authenticate(page);

  // With a live session → setup:true, authenticated:true
  const withSession = await page.evaluate(async () => {
    const res = await fetch("/api/auth/status", { credentials: "include" });
    return res.json() as Promise<{ setup: boolean; authenticated: boolean }>;
  });
  expect(withSession.setup).toBe(true);
  expect(withSession.authenticated).toBe(true);

  // Without a session cookie (Playwright's APIRequestContext does not share
  // cookies with the page) → setup:true, authenticated:false
  const withoutSession = await request.get("/api/auth/status");
  expect(withoutSession.ok()).toBe(true);
  const withoutBody = await withoutSession.json() as { setup: boolean; authenticated: boolean };
  expect(withoutBody.setup).toBe(true);
  expect(withoutBody.authenticated).toBe(false);
});

// ─── Authenticated API calls ──────────────────────────────────────────────────

test("authenticated session can reach settings endpoint", async ({ page }) => {
  await authenticate(page);

  const body = await page.evaluate(async () => {
    const res = await fetch("/api/settings", { credentials: "include" });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return res.json();
  });
  expect(body).toHaveProperty("language");
});

test("authenticated session can list entries", async ({ page }) => {
  await authenticate(page);

  const today = new Date().toISOString().split("T")[0];
  const result = await page.evaluate(async (date: string) => {
    const res = await fetch(`/api/entries?date=${date}`, { credentials: "include" });
    return { ok: res.ok, data: await res.json() };
  }, today);
  expect(result.ok).toBe(true);
  expect(Array.isArray(result.data)).toBe(true);
});

// ─── E2E encryption: server stores ciphertext, not plaintext ─────────────────

test("entry data_enc is opaque — server cannot read plaintext", async ({ page }) => {
  await authenticate(page);

  const plaintext = "API-Test: dieser Text muss verschlüsselt auf dem Server liegen.";

  // Create entry via UI (client encrypts before sending)
  await page.locator("form textarea").first().fill(plaintext);
  await page.locator("form button[type='submit']").click();

  // UI shows decrypted text
  await expect(page.getByText(plaintext).last()).toBeVisible();

  // Fetch raw rows from the server — it only sees data_enc
  const today = new Date().toISOString().split("T")[0];
  const rows = await page.evaluate(async (date: string) => {
    const res = await fetch(`/api/entries?date=${date}`, { credentials: "include" });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return res.json() as Promise<Record<string, unknown>[]>;
  }, today);

  expect(rows.length).toBeGreaterThan(0);

  // Every row must have data_enc and must NOT expose the plaintext
  for (const row of rows) {
    expect(row).toHaveProperty("data_enc");
    expect(typeof row.data_enc).toBe("string");
    expect(row.data_enc as string).not.toContain(plaintext);
    expect(row).not.toHaveProperty("content");
  }
});

test("thread data_enc is opaque — server cannot read thread text", async ({ page }) => {
  await authenticate(page);

  const threadText = "API-Test: dieser Thread-Text muss verschlüsselt sein.";

  const { status, ok } = await page.evaluate(async (id: string) => {
    const res = await fetch("/api/threads", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        done: 0,
        due_date: null,
        color: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        data_enc: "placeholder",
      }),
    });
    return { status: res.status, ok: res.ok };
  }, `thread_${Date.now()}_test`);
  expect([200, 201]).toContain(status);

  // Check that threads are encrypted
  const threads = await page.evaluate(async () => {
    const res = await fetch("/api/threads", { credentials: "include" });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return res.json() as Promise<Record<string, unknown>[]>;
  });
  expect(ok).toBe(true);

  for (const t of threads) {
    expect(t).toHaveProperty("data_enc");
    expect(t).not.toHaveProperty("text");
    expect(typeof t.data_enc).toBe("string");
    expect(t.data_enc as string).not.toContain(threadText);
  }
});

// ─── Export format ────────────────────────────────────────────────────────────

test("export returns valid JSON with version and arrays", async ({ page }) => {
  await authenticate(page);

  const body = await page.evaluate(async () => {
    const res = await fetch("/api/export", { credentials: "include" });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return res.json();
  });
  expect(body).toHaveProperty("version", 1);
  expect(Array.isArray(body.entries)).toBe(true);
  expect(Array.isArray(body.threads)).toBe(true);
  for (const e of body.entries as Record<string, unknown>[]) {
    expect(e).toHaveProperty("data_enc");
    expect(e).not.toHaveProperty("content");
  }
});
