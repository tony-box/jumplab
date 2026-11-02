import { expect, test } from "@playwright/test";

const SESSION_KEY = "bike-jumper/session-v1";

test("Designer and the legacy pose redirect work without network access", async ({
  page,
  context
}) => {
  await page.goto("/designer");
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await expect(page.getByRole("heading", { name: "Bike and Pose Designer" })).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('[data-od-id="designer-canvas"]')).toBeVisible();

  await page.goto("/pose");
  await expect(page).toHaveURL(/\/designer$/);
  await expect(page.getByRole("heading", { name: "Bike and Pose Designer" })).toBeVisible();
});

test("reload isolates corrupt session fields and preserves valid view state", async ({
  page,
  context
}) => {
  await page.goto("/workbench");
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.evaluate((key) => {
    sessionStorage.setItem(
      key,
      JSON.stringify({
        activeRoute: 42,
        activeWorkingId: { corrupt: true },
        view: { workbenchTab: "landing", playbackRate: 2, libraryQuery: "advanced" },
        staleReferences: "corrupt"
      })
    );
  }, SESSION_KEY);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('[data-od-id="input-rail"]')).toBeVisible();
  const restored = await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.getState().session);
  expect(restored?.view.workbenchTab).toBe("landing");
  expect(restored?.view.playbackRate).toBe(2);
  expect(restored?.view.libraryQuery).toBe("advanced");
  expect(Object.keys(restored?.staleReferences ?? {})).toHaveLength(0);
});

test("stale references survive reload and clear or replace without unrelated state loss", async ({
  page
}) => {
  await page.goto("/workbench");
  const references = {
    scenario: "scenario-missing",
    run: "run-missing",
    baseline: "baseline-missing",
    preset: "preset-missing"
  } as const;

  await page.evaluate((ids) => {
    const actions = window.__BIKE_JUMPER_TEST__?.getState().actions;
    actions?.setViewPreference("playbackRate", 0.5);
    actions?.setViewPreference("libraryQuery", "flow");
    Object.entries(ids).forEach(([kind, id]) => {
      actions?.markStaleReference({
        kind: kind as "scenario" | "run" | "baseline" | "preset",
        id,
        label: `${kind} unavailable`,
        reason: "Fixture removed",
        stale: true
      });
    });
  }, references);

  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(sessionStorage.getItem(key) ?? "{}").staleReferences?.length ?? 0,
        SESSION_KEY
      )
    )
    .toBe(4);
  await page.reload();

  await page.evaluate(({ run, baseline }) => {
    const actions = window.__BIKE_JUMPER_TEST__?.getState().actions;
    actions?.clearStaleReference("run", run);
    actions?.replaceStaleReference("baseline", baseline, {
      kind: "baseline",
      id: "baseline-replacement",
      label: "Replacement unavailable",
      reason: "Replacement fixture removed",
      stale: true
    });
  }, references);

  const state = await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.getState().session);
  expect(state?.staleReferences["run:run-missing"]).toBeUndefined();
  expect(state?.staleReferences["baseline:baseline-missing"]).toBeUndefined();
  expect(state?.staleReferences["baseline:baseline-replacement"]?.stale).toBe(true);
  expect(state?.staleReferences["scenario:scenario-missing"]?.stale).toBe(true);
  expect(state?.staleReferences["preset:preset-missing"]?.stale).toBe(true);
  expect(state?.view.playbackRate).toBe(0.5);
  expect(state?.view.libraryQuery).toBe("flow");
});
