import { expect, test } from "@playwright/test";

test("legacy pose route resolves to the canonical Designer visual surface", async ({ page }) => {
  await page.goto("/pose");
  await expect(page).toHaveURL(/\/designer$/);
  await expect(page.getByRole("heading", { name: "Bike and Pose Designer" })).toBeVisible();
  await expect(page.locator('[data-od-id="pose-canvas"] canvas')).toBeVisible();
});
