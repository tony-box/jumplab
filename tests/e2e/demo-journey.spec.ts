import { expect, test } from "@playwright/test";

test("complete demo journey has no presentation-action solves or dead ends", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("/library");
  await expect(page.locator('[data-od-id="library-search"] input')).toBeVisible();
  await page.keyboard.press("/");
  await page.keyboard.type("tabletop");
  await expect(page.locator('[data-od-id="library-search"] input')).toBeFocused();
  await page.keyboard.press("Escape");
  await page.locator('[data-od-id^="jump-card-"] [data-od-id="load-preset"]').first().click();

  await expect(page).toHaveURL(/\/workbench$/);
  const solveCountBeforeEdit = await page.evaluate(
    () => window.__BIKE_JUMPER_TEST__?.getSolveDispatchCount() ?? -1
  );
  await page.locator('[data-od-id="overlay-chips"]').getByRole("button").first().click();
  expect(
    await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.getSolveDispatchCount() ?? -1)
  ).toBe(solveCountBeforeEdit);

  await expect(page.locator('[data-od-id="run-solve"]')).toBeEnabled({ timeout: 20_000 });
  await page.locator('[data-od-id="run-solve"]').click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__BIKE_JUMPER_TEST__?.getState().run.active?.runId ?? null)
    )
    .toBeTruthy();
  const runId = await page.evaluate(
    () => window.__BIKE_JUMPER_TEST__?.getState().run.active?.runId ?? ""
  );
  await page.getByRole("link", { name: "Designer", exact: true }).click();
  await expect(page).toHaveURL(/\/designer$/);
  const solveCountBeforePose = await page.evaluate(
    () => window.__BIKE_JUMPER_TEST__?.getSolveDispatchCount() ?? -1
  );
  await page.locator('[data-od-id="add-keyframe"]').click();
  await page.locator('[data-od-id="apply-clip"]').click();
  await expect(page).toHaveURL(/\/workbench$/);
  expect(
    await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.getSolveDispatchCount() ?? -1)
  ).toBe(solveCountBeforePose);

  await page.goto(`/report/${runId}`);
  const solveCountBeforeReport = await page.evaluate(
    () => window.__BIKE_JUMPER_TEST__?.getSolveDispatchCount() ?? -1
  );
  await expect(page.locator('[data-od-id="report-header"]')).toBeVisible();
  await expect(page.locator('[data-od-id="charts"]')).toBeVisible();
  await page.locator('[data-od-id="open-workbench"]').click();
  await expect(page).toHaveURL(/\/workbench$/);
  expect(
    await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.getSolveDispatchCount() ?? -1)
  ).toBe(solveCountBeforeReport);

  await page.getByRole("link", { name: "Validation" }).click();
  await expect(page).toHaveURL(/\/validation$/);
  const solveCountBeforeValidation = await page.evaluate(
    () => window.__BIKE_JUMPER_TEST__?.getSolveDispatchCount() ?? -1
  );
  await page.locator('[data-od-id="run-suite"]').click();
  await expect
    .poll(() => page.locator('[data-od-id="suite-summary"]').getAttribute("data-suite-status"))
    .toBe("completed");
  expect(
    await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.getSolveDispatchCount() ?? -1)
  ).toBe(solveCountBeforeValidation);

  await page.goto("/report/00000000-0000-4000-8000-000000000000");
  await expect(page.locator('[data-od-id="report-missing"]')).toBeVisible();
  await page.goto("/not-a-product-route");
  await expect(page).toHaveURL(/\/workbench$/);
  await expect(page.locator(".topbar .btn.primary")).toHaveCount(1);
});
