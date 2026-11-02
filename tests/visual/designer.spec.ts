import { expect, test, type Page } from "@playwright/test";

const assertStableDesigner = async (page: Page) => {
  await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.settleAnimations());
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__BIKE_JUMPER_TEST__?.sampleCanvas("Bike and rider Designer preview")
            .nonTransparent ?? 0
      )
    )
    .toBeGreaterThan(100);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2))
    .toBe(true);
};

test("Designer desktop checkpoints cover valid and invalid Bike and Pose states", async ({
  page
}) => {
  await page.goto("/designer");
  await assertStableDesigner(page);
  await expect(page).toHaveScreenshot("designer-pose-valid.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.02
  });

  await page.getByRole("radio", { name: "Bike" }).click();
  await assertStableDesigner(page);
  await expect(page).toHaveScreenshot("designer-bike-valid.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.02
  });

  const reach = page.getByLabel("Reach");
  const originalReach = await reach.inputValue();
  await reach.fill("700");
  await expect(page.locator('[data-od-id="design-conflict-summary"]')).toBeVisible();
  await assertStableDesigner(page);
  await expect(page).toHaveScreenshot("designer-bike-invalid.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.02
  });

  await reach.fill(originalReach);
  await expect
    .poll(() =>
      page.evaluate(() => window.__BIKE_JUMPER_TEST__?.designerCheckpoint().geometryStatus)
    )
    .toBe("valid");
  await expect(reach).toHaveAttribute("aria-invalid", "false");
  await page.getByRole("radio", { name: "Pose" }).click();
  const hipBefore = await page.evaluate(
    () => window.__BIKE_JUMPER_TEST__?.designerCheckpoint().acceptedTargets.hip
  );
  await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.dragDesignerHandle("hip", 1.1));
  // The handle stops at the joint's limit rather than committing the request.
  await expect
    .poll(async () => {
      const hip = await page.evaluate(
        () => window.__BIKE_JUMPER_TEST__?.designerCheckpoint().acceptedTargets.hip
      );
      return hip !== undefined && hip > (hipBefore ?? 0) && hip < 1.1;
    })
    .toBe(true);
  await assertStableDesigner(page);
  await expect(page).toHaveScreenshot("designer-pose-constrained.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.02
  });

  await page.evaluate(async () => {
    const host = window as typeof window & {
      __BIKE_JUMPER_SERVICES__?: {
        solverGateway: {
          validateDesign: (scenario: unknown) => Promise<Record<string, unknown>>;
        };
      };
    };
    const scenario = window.__BIKE_JUMPER_TEST__?.getState().scenario.scenario;
    const gateway = host.__BIKE_JUMPER_SERVICES__?.solverGateway;
    if (!scenario || !gateway) throw new Error("Designer test services unavailable");
    const baseline = await gateway.validateDesign(scenario);
    const conflict = (keyIndex: number) => ({
      code: "rider-bike-overlap",
      kind: "clearance",
      keyIndex,
      riderPart: "leftThigh",
      bikePart: "topTube",
      separation: -0.02,
      message: `Key ${keyIndex + 1} rider overlaps the bicycle`
    });
    gateway.validateDesign = async () => ({
      ...baseline,
      canSolve: false,
      conflictCount: 2,
      poseKeys: (baseline.poseKeys as Array<Record<string, unknown>>).map((key, keyIndex) => ({
        ...key,
        valid: keyIndex > 1,
        conflicts: keyIndex < 2 ? [conflict(keyIndex)] : []
      }))
    });
    window.__BIKE_JUMPER_TEST__?.getState().actions.updateScenario((current) => ({
      ...current,
      poseClip: {
        ...current.poseClip,
        interpolation: current.poseClip.interpolation === "step" ? "linear" : "step"
      }
    }));
  });
  await expect(page.locator('[data-od-id="design-conflict-summary"]')).toContainText(
    "2 poses need attention"
  );
  await assertStableDesigner(page);
  await expect(page).toHaveScreenshot("designer-multi-key-conflict.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.02
  });
});

test("Designer tablet checkpoint is nonblank, stable, and unclipped", async ({
  page,
  browserName
}) => {
  test.skip(browserName !== "webkit", "Tablet acceptance uses iPad WebKit project");
  await page.goto("/designer");
  await assertStableDesigner(page);
  await expect(page).toHaveScreenshot("designer-tablet.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.02
  });
});
