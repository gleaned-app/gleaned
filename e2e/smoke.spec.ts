import { test, expect } from "@playwright/test";

test("app loads and shows the lock screen", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("h1")).toContainText("gleaned");
  // Wait for the loading spinner to go away before asserting buttons.
  await page.waitForFunction(() => !document.querySelector(".animate-spin"), { timeout: 10_000 });
  // Either the register button (fresh DB) or the unlock button (existing account) must be present.
  const hasRegister = await page.getByRole("button", { name: "Registrieren" }).isVisible().catch(() => false);
  const hasUnlock = await page.getByRole("button", { name: "Entsperren" }).isVisible().catch(() => false);
  expect(hasRegister || hasUnlock).toBe(true);
});

test("page title is set", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/gleaned/i);
});
