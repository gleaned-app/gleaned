import { test, expect } from "@playwright/test";
import { authenticate } from "./helpers";

const MOCK_CONFIG = { syncUsername: "testadmin", syncUrl: "http://localhost:5984/gleaned" };

async function openSyncTab(page: Parameters<typeof authenticate>[0]) {
  await page.getByRole("button", { name: "Einstellungen" }).click();
  await page.getByRole("button", { name: "Sync" }).click();
}

test.describe("sync auto-config", () => {
  test("pre-fills URL and username from /config.json", async ({ page }) => {
    await page.route("/config.json", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_CONFIG) })
    );

    await authenticate(page);
    await openSyncTab(page);

    await expect(page.getByPlaceholder("https://gleaned.example.com/db/gleaned")).toHaveValue(MOCK_CONFIG.syncUrl);
    await expect(page.getByPlaceholder("Benutzer")).toHaveValue(MOCK_CONFIG.syncUsername);
  });

  test("shows auto-detected chip on pre-filled fields", async ({ page }) => {
    await page.route("/config.json", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_CONFIG) })
    );

    await authenticate(page);
    await openSyncTab(page);

    const chips = page.getByText("Automatisch");
    await expect(chips).toHaveCount(2);
  });

  test("removes auto-detected chip when user edits a field", async ({ page }) => {
    await page.route("/config.json", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_CONFIG) })
    );

    await authenticate(page);
    await openSyncTab(page);

    await page.getByPlaceholder("Benutzer").fill("other-admin");
    await expect(page.getByText("Automatisch")).toHaveCount(1);
  });

  test("fields are empty when /config.json returns 404", async ({ page }) => {
    await page.route("/config.json", (route) => route.fulfill({ status: 404 }));

    await authenticate(page);
    await openSyncTab(page);

    await expect(page.getByPlaceholder("https://gleaned.example.com/db/gleaned")).toHaveValue("");
    await expect(page.getByPlaceholder("Benutzer")).toHaveValue("");
    await expect(page.getByText("Automatisch")).toHaveCount(0);
  });

  test("does not overwrite already-saved sync settings", async ({ page }) => {
    await page.route("/config.json", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ syncUsername: "auto-admin" }) })
    );

    await authenticate(page);
    await openSyncTab(page);

    // Auto-fills with "auto-admin" since nothing is saved yet
    await expect(page.getByPlaceholder("Benutzer")).toHaveValue("auto-admin");

    // User overrides and saves
    await page.getByPlaceholder("Benutzer").fill("my-admin");
    await page.getByRole("button", { name: "Speichern" }).click();
    await page.keyboard.press("Escape");

    // Reopen — saved value wins over auto-config
    await openSyncTab(page);
    await expect(page.getByPlaceholder("Benutzer")).toHaveValue("my-admin");
  });

  test("fields are empty when /config.json is malformed", async ({ page }) => {
    await page.route("/config.json", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ unrelated: true }) })
    );

    await authenticate(page);
    await openSyncTab(page);

    await expect(page.getByPlaceholder("Benutzer")).toHaveValue("");
    await expect(page.getByText("Automatisch")).toHaveCount(0);
  });
});
