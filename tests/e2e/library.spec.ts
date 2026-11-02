import { expect, test } from "@playwright/test";

test("library keyboard and handoff workflow honors data-od-id contract", async ({ page }) => {
  await page.goto("/library");

  await expect(page.locator('[data-od-id="library-search"]')).toBeVisible();
  await expect(page.locator('[data-od-id="library-tabs"]')).toBeVisible();
  await expect(page.locator('[data-od-id="view-jumps"]')).toBeVisible();
  await expect(page.locator('[data-od-id="window-explainer"]')).toBeVisible();

  await page.keyboard.press("/");
  await expect(page.locator('[data-od-id="library-search"] input')).toBeFocused();
  await page.keyboard.type("zzzz-not-found");

  await expect(page.locator('[data-od-id="library-empty-state"]')).toContainText("zzzz-not-found");
  await expect(page.locator('[data-od-id="library-clear-search"]')).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator('[data-od-id="library-search"] input')).toHaveValue("");

  const jumpCount = await page
    .locator('[data-od-id="view-jumps"] [data-od-id^="jump-card-"]')
    .count();
  expect(jumpCount).toBeGreaterThan(0);

  await page.locator('[data-od-id^="jump-card-"] [data-od-id="load-preset"]').first().click();
  await expect(page).toHaveURL(/\/workbench$/);
  await expect(page.locator('[data-od-id="scenario-chip"]')).toContainText(/Scenario/i);

  await page.goto("/library");
  await page.locator('[data-od-id^="jump-card-"] [data-od-id="duplicate-preset"]').first().click();
  await expect(page).toHaveURL(/\/workbench$/);
  await expect(page.locator('[data-od-id="scenario-chip"]')).toContainText(/Copy/i);

  await page.goto("/library");
  await page.getByRole("tab", { name: /Riders/i }).click();
  await expect(page.locator('[data-od-id="view-riders"]')).toBeVisible();

  await page.locator('[data-od-id="view-riders"] [data-od-id="load-preset"]').first().click();
  await expect(page).toHaveURL(/\/workbench$/);

  await page.goto("/library");
  await page.locator("#new-scenario").click();
  await expect(page).toHaveURL(/\/workbench$/);
});
