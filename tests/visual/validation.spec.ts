import { expect, test } from "@playwright/test";

test("validation visual state includes pass/fail/awaiting mixture, convergence SVG, long-hash wrapping, and table overflow guards", async ({
  page
}) => {
  await page.goto("/validation");

  await page.locator('[data-od-id="timestep-select"]').selectOption("0.008333333333333333");
  await page.locator('[data-od-id="run-suite"]').click();

  await expect
    .poll(async () =>
      page.locator('[data-od-id="suite-summary"]').getAttribute("data-suite-status")
    )
    .toBe("completed");

  const summary = page.locator('[data-od-id="suite-summary"]');
  await expect(summary).toContainText(/passing/i);
  await expect(summary).toContainText(/failing/i);
  await expect(summary).toContainText(/awaiting core/i);

  const convergenceChart = page.getByRole("img", {
    name: /convergence of position error against timestep/i
  });
  await expect(convergenceChart).toBeVisible();

  const measuredPoints = await page.locator('[data-od-id="convergence-chart"] circle').count();
  expect(measuredPoints).toBeGreaterThan(3);

  const hashWrap = await page.locator('[data-od-id="determinism-hashes"]').evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      whiteSpace: style.whiteSpace,
      overflowWrap: style.overflowWrap,
      wraps: node.scrollWidth <= node.clientWidth + 2
    };
  });
  expect(hashWrap.whiteSpace).toBe("pre-wrap");
  expect(["anywhere", "break-word"]).toContain(hashWrap.overflowWrap);
  expect(hashWrap.wraps).toBe(true);

  const tableOverflow = await page
    .locator('[data-od-id="convergence-table-scroll"]')
    .evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        overflowX: style.overflowX,
        scroll: node.scrollWidth,
        client: node.clientWidth
      };
    });
  expect(["auto", "scroll"]).toContain(tableOverflow.overflowX);
  expect(tableOverflow.scroll).toBeGreaterThanOrEqual(tableOverflow.client);
  await expect(page).toHaveScreenshot("validation-desktop.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.02
  });
});

test("validation tablet layout remains readable without page-wide overflow", async ({
  page,
  browserName
}) => {
  test.skip(browserName !== "webkit", "Tablet acceptance uses iPad WebKit project");

  await page.goto("/validation");
  await page.locator('[data-od-id="run-suite"]').click();
  await expect
    .poll(async () =>
      page.locator('[data-od-id="suite-summary"]').getAttribute("data-suite-status")
    )
    .toMatch(/completed|budget-exceeded|failed/);

  const overflow = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 2);

  const analyticalTop = await page.locator('[data-od-id="sec-analytical"]').boundingBox();
  const convergenceTop = await page.locator('[data-od-id="sec-convergence"]').boundingBox();
  const determinismTop = await page.locator('[data-od-id="sec-determinism"]').boundingBox();
  expect(analyticalTop?.y ?? 0).toBeLessThan(convergenceTop?.y ?? 0);
  expect(convergenceTop?.y ?? 0).toBeLessThan(determinismTop?.y ?? 0);
  await expect(page).toHaveScreenshot("validation-tablet.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.02
  });
});
