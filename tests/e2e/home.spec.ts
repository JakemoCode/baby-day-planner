import { test, expect } from "@playwright/test";

test("home page shows app title and bootstrap status", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /baby day planner/i })).toBeVisible();
  await expect(page.getByText(/bootstrap is alive/i)).toBeVisible();
});
