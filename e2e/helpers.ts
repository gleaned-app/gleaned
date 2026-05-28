import { type Page, expect } from "@playwright/test";

export const TEST_PASSWORD = "GleanedTest1!";

/**
 * Ensures the app is authenticated. Works regardless of whether the server DB
 * already has an account (SQLite is shared across all test browser contexts,
 * so later tests will find an existing account rather than a fresh one).
 *
 * - No account yet  → "choose" screen → register
 * - Account exists  → "login" screen  → log in with TEST_PASSWORD
 */
export async function authenticate(page: Page): Promise<void> {
  await page.goto("/");

  // Wait for loading spinner to disappear (mode transitions from "loading")
  await page.waitForFunction(() => {
    return !document.querySelector(".animate-spin");
  }, { timeout: 10_000 });

  const unlockBtn = page.getByRole("button", { name: "Entsperren" });
  const registerChoiceBtn = page.getByRole("button", { name: "Registrieren" }).first();

  const hasAccount = await unlockBtn.isVisible().catch(() => false);

  if (hasAccount) {
    await page.locator("input[type='password']").fill(TEST_PASSWORD);
    await unlockBtn.click();
  } else {
    // "choose" mode — click Register to go to setup
    await registerChoiceBtn.click();
    const pwInputs = page.locator("input[type='password']");
    await pwInputs.first().fill(TEST_PASSWORD);
    await pwInputs.last().fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Loslegen" }).click();
  }

  await expect(page.locator("nav.fixed")).toBeVisible({ timeout: 10_000 });
}
