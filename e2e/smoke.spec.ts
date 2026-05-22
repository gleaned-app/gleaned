import { test, expect } from "@playwright/test";

test("app loads and shows the lock screen", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("h1")).toContainText("gleaned");
  await expect(page.getByRole("button", { name: "Registrieren" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Anmelden" })).toBeVisible();
});

test("page title is set", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/gleaned/i);
});
