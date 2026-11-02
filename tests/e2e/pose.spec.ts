import { expect, test } from "@playwright/test";

test("pose clearance checkpoints expose permitted contacts and a framed nonblank preview", async ({
  page
}) => {
  await page.goto("/pose");

  await expect
    .poll(async () => {
      const checkpoint = await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.poseCheckpoint());
      return checkpoint?.minimumSeparation ?? null;
    })
    .not.toBeNull();

  const checkpoint = await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.poseCheckpoint());
  expect(checkpoint?.acceptedTargets).toEqual(checkpoint?.targets);
  expect(checkpoint?.contacts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "hand", active: true }),
      expect.objectContaining({ kind: "foot", active: true })
    ])
  );

  await expect.poll(() => page.getByLabel("Hip").getAttribute("max")).not.toBe("1.1");
  expect(Number(await page.getByLabel("Hip").getAttribute("max"))).toBeLessThan(1.1);

  await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.settleAnimations());
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__BIKE_JUMPER_TEST__?.sampleCanvas("Bike and rider Designer preview")
            .nonTransparent ?? 0
      )
    )
    .toBeGreaterThan(1000);

  const canvas = page.getByLabel("Bike and rider Designer preview");
  const box = await canvas.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2))
    .toBe(true);
});

test("all pose conflict classes remain focusable and prevent Apply dispatch", async ({ page }) => {
  await page.goto("/pose");
  await expect
    .poll(() =>
      page.evaluate(() => window.__BIKE_JUMPER_TEST__?.poseCheckpoint().minimumSeparation ?? null)
    )
    .not.toBeNull();

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
    if (!scenario || !gateway) throw new Error("Pose test services unavailable");
    const baseline = await gateway.validateDesign(scenario);
    const conflicts = [
      [
        "pelvis-below-top-tube",
        "clearance",
        0,
        "pelvis",
        "topTube",
        "Pelvis must remain above top tube"
      ],
      ["rider-bike-overlap", "clearance", 0, "torso", "handlebar", "Torso overlaps handlebar"],
      [
        "rider-bike-overlap",
        "clearance",
        0,
        "leftThigh",
        "rearTire",
        "Left thigh overlaps rear tire"
      ],
      [
        "rider-bike-overlap",
        "clearance",
        1,
        "leftUpperArm",
        "fork",
        "Left upper arm overlaps fork"
      ],
      [
        "rider-bike-overlap",
        "clearance",
        1,
        "leftThigh",
        "crankRearward",
        "Left thigh overlaps rear crank"
      ],
      ["saddle-crossing", "contact", 1, "pelvis", "saddle", "Pelvis crosses saddle from below"]
    ].map(([code, kind, keyIndex, riderPart, bikePart, message]) => ({
      code,
      kind,
      keyIndex,
      riderPart,
      bikePart,
      separation: -0.02,
      message
    }));
    gateway.validateDesign = async () => ({
      ...baseline,
      canSolve: false,
      conflictCount: conflicts.length,
      poseKeys: (baseline.poseKeys as Array<Record<string, unknown>>).map((key, keyIndex) => ({
        ...key,
        valid: false,
        minimumSeparation: -0.02,
        conflicts: conflicts.filter((conflict) => conflict.keyIndex === keyIndex)
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

  const summary = page.locator('[data-od-id="design-conflict-summary"]');
  await expect(summary).toContainText("Pelvis must remain above top tube");
  await expect(summary).toContainText("Torso overlaps handlebar");
  await expect(summary).toContainText("Left thigh overlaps rear tire");
  await expect(summary).toContainText("Left upper arm overlaps fork");
  await expect(summary).toContainText("Left thigh overlaps rear crank");
  await expect(summary).toContainText("Pelvis crosses saddle from below");

  const keyConflict = page.getByRole("button", { name: /key 2.*upper arm.*fork/i });
  await keyConflict.focus();
  await expect(keyConflict).toBeFocused();
  await keyConflict.click();
  await expect(
    page.getByRole("listbox", { name: "Keyframe list" }).getByRole("option", { selected: true })
  ).toContainText("Lip");

  const solveBefore = await page.evaluate(
    () => window.__BIKE_JUMPER_TEST__?.getSolveDispatchCount() ?? -1
  );
  await expect(page.locator("#apply-clip")).toBeDisabled();
  await page.locator("#apply-clip").evaluate((button: HTMLButtonElement) => button.click());
  expect(
    await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.getSolveDispatchCount() ?? -1)
  ).toBe(solveBefore);
  await expect(page).toHaveURL(/\/designer$/);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2))
    .toBe(true);
});

test("pose listbox keyboard, focus retention, editing, constraints, and apply-to-run contract", async ({
  page
}) => {
  await page.goto("/pose");

  await expect(page.locator('[data-od-id="clip-name"]')).toBeVisible();
  await expect(page.locator('[data-od-id="saturation-pill"]')).toBeVisible();
  await expect(page.locator('[data-od-id="keyframe-rail"]')).toBeVisible();
  await expect(page.locator('[data-od-id="pose-canvas"]')).toBeVisible();
  await expect(page.locator('[data-od-id="distance-track"]')).toBeVisible();
  await expect(page.locator('[data-od-id="joint-table"]')).toBeVisible();
  await expect(page.locator('[data-od-id="rom-table"]')).toBeVisible();

  const solveBefore = await page.evaluate(
    () => window.__BIKE_JUMPER_TEST__?.getSolveDispatchCount() ?? -1
  );

  const listbox = page.getByRole("listbox", { name: "Keyframe list" });
  await listbox.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('[data-od-id="keyframe-option"][aria-selected="true"]')).toHaveCount(1);

  await page.locator('[data-od-id="add-keyframe"]').click();
  await expect(page.locator('[data-od-id="keyframe-option"]')).toHaveCount(4);

  await page.getByLabel("Hip").evaluate((element) => {
    const input = element as HTMLInputElement;
    // React tracks the last value it saw, so bypass it or the edit is dropped.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "1.1");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const canvas = page.locator('[data-od-id="pose-canvas"] canvas');
  let canvasBox = await canvas.boundingBox();
  const handleAt = async (joint: string) =>
    (await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.poseHandlePositions() ?? [])).find(
      (candidate) => candidate.joint === joint
    );

  // Settle the async accept/reject so the control and committed pose agree.
  await expect
    .poll(async () => {
      const committed = await page.evaluate(
        () => window.__BIKE_JUMPER_TEST__?.poseCheckpoint().targets?.hip ?? null
      );
      const shown = Number(await page.getByLabel("Hip").inputValue());
      return committed === null ? Number.POSITIVE_INFINITY : Math.abs(committed - shown);
    })
    .toBeLessThan(0.0051);

  // Empty canvas is not a grab target; only a joint marker starts a drag.
  const beforeEmptyClick = await page.getByLabel("Hip").inputValue();
  await canvas.click({ position: { x: 12, y: 12 } });
  await expect(page.getByLabel("Hip")).toHaveValue(beforeEmptyClick);

  // The canvas follows its container, so measure it again right before dragging.
  canvasBox = await canvas.boundingBox();
  const handle = await handleAt("hip");
  expect(handle).toBeTruthy();
  await page.mouse.move((canvasBox?.x ?? 0) + handle!.x, (canvasBox?.y ?? 0) + handle!.y);
  await page.mouse.down();
  const dropX = (canvasBox?.x ?? 0) + handle!.x - 40;
  const dropY = (canvasBox?.y ?? 0) + handle!.y + 10;
  await page.mouse.move(dropX, dropY, { steps: 8 });
  await page.mouse.up();

  // The grabbed joint follows the pointer and stays inside its limits.
  await expect(page.getByLabel("Hip")).not.toHaveValue(beforeEmptyClick);
  const moved = await handleAt("hip");
  expect(
    Math.hypot((canvasBox?.x ?? 0) + moved!.x - dropX, (canvasBox?.y ?? 0) + moved!.y - dropY)
  ).toBeLessThan(24);
  await expect(page.locator('[data-od-id="saturation-pill"]')).toContainText(/reachable|saturated/);
  await expect
    .poll(() => page.evaluate(() => window.__BIKE_JUMPER_TEST__?.poseCheckpoint().canSolve))
    .toBe(true);

  // Limit arcs are transient guidance: shown while posing, gone once idle.
  const arcPixels = async () =>
    page.evaluate(() => {
      const element = document.querySelector<HTMLCanvasElement>(
        'canvas[aria-label="Bike and rider Designer preview"]'
      );
      const context = element?.getContext("2d");
      if (!element || !context) return -1;
      const pixels = context.getImageData(0, 0, element.width, element.height).data;
      const arcTones = [
        [91, 74, 74],
        [111, 147, 166],
        [169, 220, 240],
        [138, 95, 95],
        [244, 198, 106]
      ];
      let count = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (
          arcTones.some(
            ([r, g, b]) =>
              Math.abs(pixels[index]! - r!) < 6 &&
              Math.abs(pixels[index + 1]! - g!) < 6 &&
              Math.abs(pixels[index + 2]! - b!) < 6
          )
        ) {
          count += 1;
        }
      }
      return count;
    });

  await page.mouse.move((canvasBox?.x ?? 0) + 12, (canvasBox?.y ?? 0) + 12);
  const activeArcPixels = await arcPixels();
  expect(activeArcPixels).toBeGreaterThan(0);
  await expect.poll(arcPixels, { timeout: 6000 }).toBeLessThan(activeArcPixels);

  await page.locator("#apply-clip").click();
  await expect(page).toHaveURL(/\/workbench$/);

  const solveAfter = await page.evaluate(
    () => window.__BIKE_JUMPER_TEST__?.getSolveDispatchCount() ?? -1
  );
  expect(solveAfter).toBe(solveBefore);
});

test("bike mode edits canonical geometry, recovers invalid drafts, and stays static across pose keys", async ({
  page
}) => {
  await page.goto("/pose");
  await page.getByRole("radio", { name: "Bike" }).click();

  const rail = page.locator('[data-od-id="bike-geometry-rail"]');
  const derived = page.locator('[data-od-id="bike-derived-rail"]');
  await expect(rail).toBeVisible();
  await expect(derived).toContainText("Frame alignment");
  await expect(derived).not.toContainText("Canonical landmarks");
  await expect(page.locator('[data-od-id="keyframe-rail"]')).toHaveCount(0);
  await expect(page.locator('[data-od-id="distance-track"]')).toHaveCount(0);

  const reach = page.getByLabel("Reach");
  const originalReach = await reach.inputValue();
  const canvas = page.getByLabel("Bike and rider Designer preview");
  const stableSize = await canvas.boundingBox();
  expect(stableSize).not.toBeNull();

  await reach.fill("700");
  await expect(page.locator('[data-od-id="design-conflict-summary"]')).toContainText(
    "supported range"
  );
  await expect(reach).toHaveAttribute("aria-invalid", "true");
  expect(await canvas.boundingBox()).toMatchObject({
    width: stableSize!.width,
    height: stableSize!.height
  });

  await reach.fill(originalReach);
  await expect(reach).toHaveAttribute("aria-invalid", "false");
  await expect(derived).toContainText(/mm/);

  for (const frameType of ["Rigid", "Hardtail", "Full suspension"]) {
    await page.getByRole("radio", { name: frameType }).click();
    await expect(page.getByRole("radio", { name: frameType })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  }

  const bikeValue = await reach.inputValue();
  await page.getByRole("radio", { name: "Pose" }).click();
  const keyframes = page.getByRole("listbox", { name: "Keyframe list" });
  await keyframes.getByRole("option").nth(1).click();
  await page.getByRole("radio", { name: "Bike" }).click();
  await expect(reach).toHaveValue(bikeValue);

  await reach.focus();
  await expect(reach).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2))
    .toBe(true);
});
