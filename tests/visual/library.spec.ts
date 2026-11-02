import { expect, test } from "@playwright/test";

test("library desktop visual structure shows card grid, deterministic thumbnails, and unavailable-window wording", async ({
  page
}) => {
  await page.goto("/library");

  const jumpCards = page.locator('[data-od-id="view-jumps"] [data-od-id^="jump-card-"]');
  await expect(jumpCards.first()).toBeVisible();

  const gridColumns = await page
    .locator('[data-od-id="view-jumps"] .library-card-grid')
    .evaluate((node) => {
      return getComputedStyle(node).gridTemplateColumns.split(" ").length;
    });
  expect(gridColumns).toBeGreaterThan(1);

  const thumbPaths = await jumpCards.first().locator('[data-od-id="jump-thumbnail"] path').count();
  expect(thumbPaths).toBeGreaterThan(0);

  const unavailable = page.locator('[data-window-status="unavailable"]').first();
  await expect(unavailable).toContainText(/unavailable|awaiting|reason/i);
  await expect(unavailable).not.toContainText(/0\.00\s*[-–]\s*0\.00/);

  const longTitle = page.locator('[data-od-id^="jump-card-"]').filter({ hasText: "Long" }).first();
  if (await longTitle.count()) {
    await expect(longTitle).toBeVisible();
  }
  await expect(page).toHaveScreenshot("library-desktop.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.02
  });
});

test("library tablet visual structure keeps internal table scrolling without page-wide overflow", async ({
  page,
  browserName
}) => {
  test.skip(browserName !== "webkit", "Tablet acceptance uses iPad WebKit project");

  await page.goto("/library");
  await page.getByRole("tab", { name: /Bikes/i }).click();

  const tableScroller = page.locator(
    '[data-od-id="view-bikes"] [data-od-id="preset-table-scroll"]'
  );
  await expect(tableScroller).toBeVisible();

  const dimensions = await tableScroller.evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeGreaterThanOrEqual(dimensions.clientWidth);

  const pageOverflow = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth
  }));
  expect(pageOverflow.scroll).toBeLessThanOrEqual(pageOverflow.client + 2);
  await expect(page).toHaveScreenshot("library-tablet.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.02
  });
});
