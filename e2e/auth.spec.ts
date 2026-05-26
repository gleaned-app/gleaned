import { test, expect } from "@playwright/test";
import { authenticate, TEST_PASSWORD } from "./helpers";

test("registers with a strong password and unlocks the app", async ({ page }) => {
  await authenticate(page);

  await expect(page.locator("nav")).toBeVisible();
  await expect(page.getByRole("button", { name: "Journal" })).toBeVisible();
});

test("shows an error when passwords do not match", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Registrieren" }).click();

  const pwInputs = page.locator("input[type='password']");
  await pwInputs.first().fill(TEST_PASSWORD);
  await pwInputs.last().fill("WrongConfirm9!");
  await page.getByRole("button", { name: "Loslegen" }).click();

  await expect(page.getByText("Passwörter stimmen nicht überein.")).toBeVisible();
});

test("back button returns to the choose screen", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Registrieren" }).click();

  await expect(page.locator("input[type='password']").first()).toBeVisible();

  await page.getByRole("button", { name: "Zurück" }).click();

  await expect(page.getByRole("button", { name: "Registrieren" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gerät verbinden" })).toBeVisible();
});

test("locks and unlocks via the profile menu", async ({ page }) => {
  await authenticate(page);

  // Lock via keyboard shortcut
  await page.keyboard.press("Meta+l");

  await expect(page.getByRole("button", { name: "Entsperren" })).toBeVisible();

  // Log back in
  await page.locator("input[type='password']").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Entsperren" }).click();

  await expect(page.locator("nav")).toBeVisible();
});
