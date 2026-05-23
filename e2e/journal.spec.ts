import { test, expect } from "@playwright/test";
import { authenticate } from "./helpers";

test.beforeEach(async ({ page }) => {
  await authenticate(page);
});

// The form contains multiple textareas (content + gap inside collapsed context panel).
// Use .first() to target the main content textarea unambiguously.
const contentArea = (page: import("@playwright/test").Page) =>
  page.locator("form textarea").first();

test("entry textarea is visible and focused", async ({ page }) => {
  await expect(contentArea(page)).toBeVisible();
  await expect(contentArea(page)).toBeFocused();
});

test("save button is disabled when textarea is empty", async ({ page }) => {
  await expect(page.locator("form button[type='submit']")).toBeDisabled();
});

test("creates an entry and shows it in the list", async ({ page }) => {
  const content = "Heute habe ich gelernt, dass Playwright sehr praktisch ist.";
  await contentArea(page).fill(content);

  await expect(page.locator("form button[type='submit']")).toBeEnabled();
  await page.locator("form button[type='submit']").click();

  await expect(page.getByText(content)).toBeVisible();
});

test("saves an entry with Ctrl+Enter shortcut", async ({ page }) => {
  const content = "Shortcut-Test: Ctrl+Enter speichert den Eintrag.";
  await contentArea(page).fill(content);
  await page.keyboard.press("Control+Enter");

  await expect(page.getByText(content)).toBeVisible();
});

test("clears the textarea after saving", async ({ page }) => {
  await contentArea(page).fill("Ein schneller Lernmoment.");
  await page.locator("form button[type='submit']").click();

  await expect(contentArea(page)).toHaveValue("");
});
