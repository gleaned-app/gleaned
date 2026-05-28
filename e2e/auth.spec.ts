import { test, expect } from "@playwright/test";
import { authenticate, TEST_PASSWORD } from "./helpers";

test("registers or logs in and shows the main app", async ({ page }) => {
  await authenticate(page);

  await expect(page.locator("nav.fixed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Journal" })).toBeVisible();
});

test("shows an error when passwords do not match", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !document.querySelector(".animate-spin"), { timeout: 10_000 });

  // Reach setup mode regardless of whether an account already exists
  const unlockVisible = await page.getByRole("button", { name: "Entsperren" }).isVisible().catch(() => false);
  if (unlockVisible) {
    // login screen: click "Registrieren" link to go to setup
    await page.getByRole("button", { name: "Registrieren" }).click();
  } else {
    // choose screen: click the main "Registrieren" button
    await page.getByRole("button", { name: "Registrieren" }).click();
  }

  const pwInputs = page.locator("input[type='password']");
  await pwInputs.first().fill(TEST_PASSWORD);
  await pwInputs.last().fill("WrongConfirm9!");
  await page.getByRole("button", { name: "Loslegen" }).click();

  await expect(page.getByText("Passwörter stimmen nicht überein.")).toBeVisible();
});

test("back button returns to the previous screen", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !document.querySelector(".animate-spin"), { timeout: 10_000 });

  const unlockVisible = await page.getByRole("button", { name: "Entsperren" }).isVisible().catch(() => false);

  if (unlockVisible) {
    // login → setup → back → login
    await page.getByRole("button", { name: "Registrieren" }).click();
    await expect(page.locator("input[type='password']").first()).toBeVisible();
    await page.getByRole("button", { name: "← Zurück" }).click();
    await expect(page.getByRole("button", { name: "Entsperren" })).toBeVisible();
  } else {
    // choose → setup → back → choose
    await page.getByRole("button", { name: "Registrieren" }).click();
    await expect(page.locator("input[type='password']").first()).toBeVisible();
    await page.getByRole("button", { name: "← Zurück" }).click();
    await expect(page.getByRole("button", { name: "Registrieren" })).toBeVisible();
  }
});

test("locks and unlocks via the keyboard shortcut", async ({ page }) => {
  await authenticate(page);

  await page.keyboard.press("Meta+l");

  await expect(page.getByRole("button", { name: "Entsperren" })).toBeVisible();

  await page.locator("input[type='password']").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Entsperren" }).click();

  await expect(page.locator("nav.fixed")).toBeVisible();
});
