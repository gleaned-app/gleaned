import { test, expect } from "@playwright/test";
import { authenticate } from "./helpers";

test.beforeEach(async ({ page }) => {
  await authenticate(page);
});

test("entry textarea is visible and focused", async ({ page }) => {
  await expect(page.locator("textarea")).toBeVisible();
  await expect(page.locator("textarea")).toBeFocused();
});

test("save button is disabled when textarea is empty", async ({ page }) => {
  await expect(page.locator("form button[type='submit']")).toBeDisabled();
});

test("creates an entry and shows it in the list", async ({ page }) => {
  const content = "Heute habe ich gelernt, dass Playwright sehr praktisch ist.";
  await page.locator("textarea").fill(content);

  await expect(page.locator("form button[type='submit']")).toBeEnabled();
  await page.locator("form button[type='submit']").click();

  await expect(page.getByText(content)).toBeVisible();
});

test("saves an entry with Ctrl+Enter shortcut", async ({ page }) => {
  const content = "Shortcut-Test: Ctrl+Enter speichert den Eintrag.";
  await page.locator("textarea").fill(content);
  await page.keyboard.press("Control+Enter");

  await expect(page.getByText(content)).toBeVisible();
});

test("clears the textarea after saving", async ({ page }) => {
  await page.locator("textarea").fill("Ein schneller Lernmoment.");
  await page.locator("form button[type='submit']").click();

  await expect(page.locator("textarea")).toHaveValue("");
});
