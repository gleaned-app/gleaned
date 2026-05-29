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

  const unlockBtn = page.getByRole("button", { name: "Entsperren" });
  const registerChoiceBtn = page.getByRole("button", { name: "Registrieren" }).first();

  // Wait for the LockScreen to settle: hasPassword() is async, so neither button
  // appears until it resolves. We wait for whichever shows up first.
  await Promise.any([
    unlockBtn.waitFor({ state: "visible", timeout: 15_000 }),
    registerChoiceBtn.waitFor({ state: "visible", timeout: 15_000 }),
  ]);

  const hasAccount = await unlockBtn.isVisible();

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

  await expect(page.locator("nav.fixed")).toBeVisible({ timeout: 15_000 });

  // Poll /api/settings until the session cookie is confirmed working.
  // The login flow involves client-side PBKDF2 after the server sets the cookie,
  // so there can be a brief delay before React mounts and the session is live.
  await expect(async () => {
    const ok = await page.evaluate(async () => {
      const res = await fetch("/api/settings", { credentials: "include" });
      return res.ok;
    });
    expect(ok, "session not established after nav.fixed appeared").toBe(true);
  }).toPass({ timeout: 15_000 });
}
