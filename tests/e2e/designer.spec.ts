import { expect, test } from "@playwright/test";

async function expectScenarioReady(page: import("@playwright/test").Page) {
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(window.__BIKE_JUMPER_TEST__?.getState().scenario.scenario))
    )
    .toBe(true);
}

test("Designer is canonical and an old pose bookmark preserves the active scenario", async ({
  page
}) => {
  await page.goto("/workbench");
  await expectScenarioReady(page);
  await page.evaluate(() => {
    window.__BIKE_JUMPER_TEST__?.getState().actions.updateScenario((current) => ({
      ...current,
      poseClip: { ...current.poseClip, interpolation: "step" }
    }));
  });
  const scenarioId = await page.evaluate(
    () => window.__BIKE_JUMPER_TEST__?.getState().scenario.scenario?.id
  );

  await page.evaluate(() => {
    history.pushState({}, "", "/pose");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page).toHaveURL(/\/designer$/);
  await expect(page.getByRole("heading", { name: "Bike and Pose Designer" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Primary" }).getByText("Designer")
  ).toBeVisible();
  expect(
    await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.getState().scenario.scenario?.id)
  ).toBe(scenarioId);
  expect(
    await page.evaluate(
      () => window.__BIKE_JUMPER_TEST__?.getState().scenario.scenario?.poseClip.interpolation
    )
  ).toBe("step");
});

test("related views target the canonical Designer without changing their primary actions", async ({
  page
}) => {
  for (const route of ["/workbench", "/report", "/library", "/validation"]) {
    await page.goto(route);
    await expect(page.getByRole("link", { name: "Open Designer" })).toHaveAttribute(
      "href",
      "/designer"
    );
    await expect(page.locator(".topbar .btn.primary")).toHaveCount(1);
  }
});

test("Bike and Pose modes share one stable preview and only Pose exposes the timeline", async ({
  page
}) => {
  await page.goto("/designer");

  const preview = page.locator('[data-od-id="designer-canvas"]');
  await expect(preview).toBeVisible();
  await expect(page.locator('[data-od-id="pose-canvas"]')).toBeVisible();
  const stableSize = await preview.boundingBox();

  await page.getByRole("radio", { name: "Bike" }).click();
  await expect(page.locator('[data-od-id="bike-geometry-rail"]')).toBeVisible();
  await expect(page.locator('[data-od-id="keyframe-rail"]')).toHaveCount(0);
  await expect(page.locator('[data-od-id="distance-track"]')).toHaveCount(0);

  await page.getByRole("radio", { name: "Pose" }).click();
  await expect(page.locator('[data-od-id="keyframe-rail"]')).toBeVisible();
  await expect(page.locator('[data-od-id="distance-track"]')).toBeVisible();
  expect(await preview.boundingBox()).toMatchObject({
    width: stableSize!.width,
    height: stableSize!.height
  });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2))
    .toBe(true);
});

test("Designer conflicts recover and Apply to Run keeps the shared scenario", async ({ page }) => {
  await page.goto("/designer");
  await expectScenarioReady(page);
  const scenarioId = await page.evaluate(
    () => window.__BIKE_JUMPER_TEST__?.getState().scenario.scenario?.id
  );

  await page.getByRole("radio", { name: "Bike" }).click();
  const reach = page.getByLabel("Reach");
  const originalReach = await reach.inputValue();
  await reach.fill("700");
  await expect(page.locator('[data-od-id="design-conflict-summary"]')).toContainText(
    "supported range"
  );
  await expect(page.locator("#apply-clip")).toBeDisabled();

  await reach.fill(originalReach);
  await expect(reach).toHaveAttribute("aria-invalid", "false");
  await page.getByRole("radio", { name: "Pose" }).click();
  await page.locator("#apply-clip").click();
  await expect(page).toHaveURL(/\/workbench$/);
  expect(
    await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.getState().scenario.scenario?.id)
  ).toBe(scenarioId);
});
