import { test, expect } from "@playwright/test";
import { authenticate } from "./helpers";

test.beforeEach(async ({ page }) => {
  await authenticate(page);
});

test("Journal tab is active by default", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Journal" })).toHaveAttribute("data-active", "true");
});

test("navigates to the Calendar view", async ({ page }) => {
  await page.getByRole("button", { name: "Kalender" }).click();

  await expect(page.getByRole("button", { name: "Kalender" })).toHaveAttribute("data-active", "true");
  await expect(page.getByRole("button", { name: "Journal" })).toHaveAttribute("data-active", "false");
});

test("navigates to the Threads view", async ({ page }) => {
  await page.getByRole("button", { name: "Threads" }).click();

  await expect(page.getByRole("button", { name: "Threads" })).toHaveAttribute("data-active", "true");
});

test("navigates to the Review view", async ({ page }) => {
  await page.getByRole("button", { name: "Review" }).click();

  await expect(page.getByRole("button", { name: "Review" })).toHaveAttribute("data-active", "true");
});

test("can switch between all views and return to Journal", async ({ page }) => {
  for (const tab of ["Kalender", "Threads", "Review", "Journal"]) {
    await page.getByRole("button", { name: tab }).click();
    await expect(page.getByRole("button", { name: tab })).toHaveAttribute("data-active", "true");
  }
});
