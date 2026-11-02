import { expect, test } from "@playwright/test";

const sampleCanvas = async (page: Parameters<typeof test>[0]["page"]) => {
  return page.evaluate(
    () => window.__BIKE_JUMPER_TEST__?.sampleCanvas("Jump simulation stage") ?? null
  );
};

test("workbench visual checkpoints are nonblank at frame 0/takeoff/mid-flight/landing", async ({
  page
}) => {
  await page.goto("/workbench");
  await page.locator("#run-solve").click();
  await expect
    .poll(async () =>
      page.evaluate(() => window.__BIKE_JUMPER_TEST__?.getSolveDispatchCount() ?? 0)
    )
    .toBe(1);

  await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.seekFrame(0));
  const camera = await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.cameraCheckpoint());
  expect(camera?.mode).toBe("follow");
  expect(camera?.modelHeightFraction ?? 0).toBeGreaterThanOrEqual(0.28);
  expect(camera?.modelHeightFraction ?? 1).toBeLessThanOrEqual(0.36);
  const frameZero = await page.evaluate(() => {
    const state = window.__BIKE_JUMPER_TEST__?.getState();
    return state?.scenario.scenario?.entry.startX ?? 0;
  });
  const horizontalFraction = camera
    ? (frameZero - camera.view.minX) / (camera.view.maxX - camera.view.minX)
    : 0;
  expect(horizontalFraction).toBeGreaterThanOrEqual(0.32);
  expect(horizontalFraction).toBeLessThanOrEqual(0.38);
  const frame0 = await sampleCanvas(page);
  expect(frame0?.nonTransparent ?? 0).toBeGreaterThan(1000);

  await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.seekFrame(120));
  const takeoff = await sampleCanvas(page);
  expect(takeoff?.maximum ?? 0).toBeGreaterThan(takeoff?.minimum ?? 0);

  await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.seekFrame(220));
  const midFlight = await sampleCanvas(page);
  expect(midFlight?.maximum ?? 0).toBeGreaterThan(midFlight?.minimum ?? 0);

  await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.seekFrame(320));
  const landing = await sampleCanvas(page);
  expect(landing?.nonTransparent ?? 0).toBeGreaterThan(1000);

  await page.locator('[data-od-id="pin-baseline"]').click();
  await page
    .locator('[data-od-id="overlay-chips"]')
    .getByRole("button", { name: "Baseline" })
    .click();
  const withBaseline = await sampleCanvas(page);
  expect(withBaseline?.nonTransparent ?? 0).toBeGreaterThan(1000);
  await expect(page).toHaveScreenshot("workbench-desktop.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.02
  });
});

test("workbench visual layout remains nonblank on tablet viewport", async ({
  page,
  browserName
}) => {
  test.skip(browserName !== "webkit", "Tablet acceptance uses iPad WebKit project");

  await page.goto("/workbench");
  await page.locator("#run-solve").click();
  await expect
    .poll(async () =>
      page.evaluate(() => window.__BIKE_JUMPER_TEST__?.getSolveDispatchCount() ?? 0)
    )
    .toBe(1);
  const sample = await sampleCanvas(page);
  expect(sample?.nonTransparent ?? 0).toBeGreaterThan(1000);

  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 2);

  await expect(page).toHaveScreenshot("workbench-tablet.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.02
  });
});

test("touchdown indicator is visible only on the first grounded frame", async ({ page }) => {
  await page.goto("/workbench");
  await page.locator("#run-solve").click();
  await expect
    .poll(async () =>
      page.evaluate(() => window.__BIKE_JUMPER_TEST__?.getSolveDispatchCount() ?? 0)
    )
    .toBe(1);

  const touchdownFrame = await expect
    .poll(async () =>
      page.evaluate(() => window.__BIKE_JUMPER_TEST__?.workbenchGeometryCheckpoint().touchdownFrame)
    )
    .not.toBeNull()
    .then(() =>
      page.evaluate(
        () => window.__BIKE_JUMPER_TEST__?.workbenchGeometryCheckpoint().touchdownFrame ?? -1
      )
    );
  expect(touchdownFrame).toBeGreaterThan(0);

  for (const [frameIndex, expected] of [
    [touchdownFrame - 1, false],
    [touchdownFrame, true],
    [touchdownFrame + 1, false]
  ] as const) {
    await page.evaluate((index) => window.__BIKE_JUMPER_TEST__?.seekFrame(index), frameIndex);
    await expect
      .poll(async () =>
        page.evaluate(
          () => window.__BIKE_JUMPER_TEST__?.workbenchGeometryCheckpoint().touchdownIndicatorVisible
        )
      )
      .toBe(expected);
    const sample = await sampleCanvas(page);
    expect(sample?.nonTransparent ?? 0).toBeGreaterThan(1000);
  }
});
