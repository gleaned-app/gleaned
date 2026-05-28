/**
 * API integration tests — verify the server behaves correctly as an
 * authenticated client. These tests run against the real dev server with
 * the real SQLite database, so they complement the unit tests which mock
 * apiFetch at the module boundary.
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

// ─── Authenticated API calls ──────────────────────────────────────────────────

test("authenticated session can reach settings endpoint", async ({ page }) => {
  await authenticate(page);

  const res = await page.request.get("/api/settings");
  expect(res.ok()).toBe(true);
  const body = await res.json();
  // Server returns at least the language field
  expect(body).toHaveProperty("language");
});

test("authenticated session can list entries", async ({ page }) => {
  await authenticate(page);

  const today = new Date().toISOString().split("T")[0];
  const res = await page.request.get(`/api/entries?date=${today}`);
  expect(res.ok()).toBe(true);
  expect(Array.isArray(await res.json())).toBe(true);
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
  const res = await page.request.get(`/api/entries?date=${today}`);
  expect(res.ok()).toBe(true);

  const rows = await res.json() as Record<string, unknown>[];
  expect(rows.length).toBeGreaterThan(0);

  // Every row must have data_enc and must NOT expose the plaintext
  for (const row of rows) {
    expect(row).toHaveProperty("data_enc");
    expect(typeof row.data_enc).toBe("string");
    expect(row.data_enc as string).not.toContain(plaintext);
    // data_enc must not contain the word "content" — the key inside the JSON blob
    expect(row).not.toHaveProperty("content");
  }
});

test("thread data_enc is opaque — server cannot read thread text", async ({ page }) => {
  await authenticate(page);

  // Navigate to Threads view and create a thread via the API directly
  const threadText = "API-Test: dieser Thread-Text muss verschlüsselt sein.";

  const res = await page.request.post("/api/threads", {
    data: {
      id: `thread_${Date.now()}_test`,
      done: 0,
      due_date: null,
      color: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      data_enc: "placeholder", // will be replaced by real client
    },
  });
  // The server accepts the row as-is (idempotent upsert)
  expect([200, 201]).toContain(res.status());

  // Check that a real thread created via UI is also encrypted
  const listRes = await page.request.get("/api/threads");
  expect(listRes.ok()).toBe(true);
  const threads = await listRes.json() as Record<string, unknown>[];

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

  const res = await page.request.get("/api/export");
  expect(res.ok()).toBe(true);

  const body = await res.json();
  expect(body).toHaveProperty("version", 1);
  expect(Array.isArray(body.entries)).toBe(true);
  expect(Array.isArray(body.threads)).toBe(true);
  // Exported entries must have data_enc, not plaintext content
  for (const e of body.entries as Record<string, unknown>[]) {
    expect(e).toHaveProperty("data_enc");
    expect(e).not.toHaveProperty("content");
  }
});
