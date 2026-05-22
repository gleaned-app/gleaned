import { type Page, expect } from "@playwright/test";

export const TEST_PASSWORD = "GleanedTest1!";

/**
 * Registers a fresh account and waits until the main app is visible.
 * Works on a blank browser context (no IndexedDB) — Playwright isolates each
 * test context by default, so no manual cleanup is needed.
 */
export async function authenticate(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Registrieren" }).click();

  const pwInputs = page.locator("input[type='password']");
  await pwInputs.first().fill(TEST_PASSWORD);
  await pwInputs.last().fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Loslegen" }).click();

  await expect(page.locator("nav")).toBeVisible();
}
