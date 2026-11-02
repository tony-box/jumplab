import { expect, test } from "@playwright/test";

const solveAndFindTouchdown = async (page: Parameters<typeof test>[0]["page"]) => {
  await page.locator("#run-solve").click();
  await expect
    .poll(async () =>
      page.evaluate(() => window.__BIKE_JUMPER_TEST__?.getSolveDispatchCount() ?? 0)
    )
    .toBe(1);
  await expect(page.getByRole("button", { name: "Play" })).toBeEnabled({ timeout: 20_000 });
  await expect(page.locator('[data-od-id="terrain-status"]')).toContainText("terrain ready");

  const touchdownFrame = await page.evaluate(
    () => window.__BIKE_JUMPER_TEST__?.workbenchGeometryCheckpoint().touchdownFrame ?? null
  );
  expect(touchdownFrame).not.toBeNull();
  return touchdownFrame as number;
};

test("opening a legacy run regenerates it before corrected animation is shown", async ({
  page
}) => {
  test.setTimeout(120_000);
  const runId = "74200000-0000-4000-8000-000000000042";

  await page.goto("/workbench");
  await expect
    .poll(async () =>
      page.evaluate(() => Boolean(window.__BIKE_JUMPER_TEST__?.getState().scenario.scenario))
    )
    .toBe(true);

  const seeded = await page.evaluate(async (legacyRunId) => {
    const hooks = window.__BIKE_JUMPER_TEST__;
    const services = (
      window as Window & {
        __BIKE_JUMPER_SERVICES__?: {
          solverGateway: {
            solve: (runId: string, scenario: unknown) => Promise<any>;
          };
          runArtifactRepository: {
            save: (artifact: any) => Promise<any>;
            list: () => Promise<Array<{ runId: string }>>;
            remove: (runId: string) => Promise<void>;
          };
        };
      }
    ).__BIKE_JUMPER_SERVICES__;
    const scenario = hooks?.getState().scenario.scenario;
    if (!hooks || !services || !scenario) {
      throw new Error("Workbench test services were not initialized");
    }

    const existing = await services.runArtifactRepository.list();
    await Promise.all(
      existing.map((artifact) => services.runArtifactRepository.remove(artifact.runId))
    );

    const current = await services.solverGateway.solve(legacyRunId, scenario);
    const legacySolverVersion = `${current.model.solverVersion}-legacy`;
    const legacy = {
      ...current,
      model: { ...current.model, solverVersion: legacySolverVersion },
      manifest: { ...current.manifest, solverVersion: legacySolverVersion }
    };
    await services.runArtifactRepository.save(legacy);

    return {
      scenarioSnapshot: current.scenarioSnapshot,
      scenarioHash: current.scenarioHash,
      solverVersion: current.model.solverVersion,
      frameLayout: current.manifest.frameLayout
    };
  }, runId);

  await page.goto(`/report/${runId}`);
  await expect(page.locator('[data-od-id="report-header"]')).toBeVisible();

  await page.evaluate(async (legacyRunId) => {
    type RegenerationWindow = Window & {
      __BIKE_JUMPER_SERVICES__?: {
        solverGateway: {
          solve: (runId: string, scenario: unknown) => Promise<any>;
        };
        runArtifactRepository: {
          get: (runId: string) => Promise<any>;
        };
      };
      __T042_REGENERATION__?: {
        count: number;
        calls: Array<{ runId: string; scenario: unknown }>;
        release: (() => void) | null;
      };
    };
    const hooks = window.__BIKE_JUMPER_TEST__;
    const testWindow = window as RegenerationWindow;
    const services = testWindow.__BIKE_JUMPER_SERVICES__;
    const legacy = await services?.runArtifactRepository.get(legacyRunId);
    if (!hooks || !services || !legacy) {
      throw new Error("Legacy run could not be opened through test services");
    }

    const originalSolve = services.solverGateway.solve.bind(services.solverGateway);
    let releaseRegeneration: (() => void) | null = null;
    const regenerationGate = new Promise<void>((resolve) => {
      releaseRegeneration = resolve;
    });
    testWindow.__T042_REGENERATION__ = {
      count: 0,
      calls: [],
      release: releaseRegeneration
    };
    services.solverGateway.solve = async (regeneratedRunId, scenario) => {
      const observation = testWindow.__T042_REGENERATION__;
      if (!observation) throw new Error("Regeneration observation was removed");
      observation.count += 1;
      observation.calls.push({
        runId: regeneratedRunId,
        scenario: structuredClone(scenario)
      });
      await regenerationGate;
      return originalSolve(regeneratedRunId, scenario);
    };

    const actions = hooks.getState().actions;
    actions.setScenarioFromSnapshot(legacy.scenarioSnapshot, legacy.scenarioHash, legacyRunId);
    actions.beginSolve(legacyRunId);
    actions.commitRunResult(legacy.manifest);
  }, runId);

  await page.getByRole("link", { name: "Workbench" }).click();
  await expect(page).toHaveURL(/\/workbench$/);
  await expect(page.getByText("Regenerating saved run")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __T042_REGENERATION__?: { count: number } }).__T042_REGENERATION__
            ?.count ?? 0
      )
    )
    .toBeGreaterThan(0);

  const blockedCheckpoint = await page.evaluate(() =>
    window.__BIKE_JUMPER_TEST__?.workbenchGeometryCheckpoint()
  );
  expect(blockedCheckpoint?.landmarks).toBeNull();
  expect(blockedCheckpoint?.touchdownFrame).toBeNull();

  const regenerationCall = await page.evaluate(
    () =>
      (
        window as Window & {
          __T042_REGENERATION__?: { calls: Array<{ runId: string; scenario: unknown }> };
        }
      ).__T042_REGENERATION__?.calls ?? []
  );
  expect(regenerationCall.length).toBeGreaterThan(0);
  for (const call of regenerationCall) {
    expect(call).toEqual({ runId, scenario: seeded.scenarioSnapshot });
  }

  await page.evaluate(() => {
    const observation = (
      window as Window & { __T042_REGENERATION__?: { release: (() => void) | null } }
    ).__T042_REGENERATION__;
    if (!observation?.release) throw new Error("Regeneration solve was not waiting");
    observation.release();
  });

  await expect(page.getByText("Run regenerated", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-od-id="terrain-status"]')).toContainText("terrain ready");

  const stored = await page.evaluate(async (regeneratedRunId) => {
    const repository = (
      window as Window & {
        __BIKE_JUMPER_SERVICES__?: {
          runArtifactRepository: { get: (runId: string) => Promise<any> };
        };
      }
    ).__BIKE_JUMPER_SERVICES__?.runArtifactRepository;
    if (!repository) throw new Error("Run artifact repository is unavailable");
    const artifact = await repository.get(regeneratedRunId);
    if (!artifact) throw new Error("Regenerated run was not persisted");
    return {
      runId: artifact.runId,
      scenarioSnapshot: artifact.scenarioSnapshot,
      scenarioHash: artifact.scenarioHash,
      solverVersion: artifact.model.solverVersion,
      manifestSolverVersion: artifact.manifest.solverVersion,
      frameLayout: artifact.manifest.frameLayout,
      frameByteLength: artifact.frameBuffer.byteLength
    };
  }, runId);

  expect(stored).toMatchObject({
    runId,
    scenarioSnapshot: seeded.scenarioSnapshot,
    scenarioHash: seeded.scenarioHash,
    solverVersion: seeded.solverVersion,
    manifestSolverVersion: seeded.solverVersion,
    frameLayout: seeded.frameLayout
  });
  expect(stored.frameLayout.strideFloat32).toBe(seeded.frameLayout.strideFloat32);
  expect(stored.frameByteLength % (stored.frameLayout.strideFloat32 * 4)).toBe(0);

  const touchdownFrame = await page.evaluate(
    () => window.__BIKE_JUMPER_TEST__?.workbenchGeometryCheckpoint().touchdownFrame ?? null
  );
  expect(touchdownFrame).not.toBeNull();
  await page.evaluate((frame) => window.__BIKE_JUMPER_TEST__?.seekFrame(frame), touchdownFrame);
  await expect(page.locator('[data-od-id="contact-readout"]')).toHaveAttribute(
    "data-touchdown-visible",
    "true"
  );
  const correctedContact = await page.evaluate(() =>
    window.__BIKE_JUMPER_TEST__?.workbenchGeometryCheckpoint()
  );
  expect(correctedContact?.groundedRear || correctedContact?.groundedFront).toBe(true);
  expect(correctedContact?.minClearance ?? -1).toBeGreaterThanOrEqual(-0.01);
});

test("workbench keyboard and primary workflow honors solve-only dispatch", async ({ page }) => {
  await page.goto("/workbench");

  await expect(page.locator('[data-od-id="input-rail"]')).toBeVisible();
  await expect(page.locator('[data-od-id="overlay-bar"]')).toBeVisible();
  await expect(page.locator('[data-od-id="transport"]')).toBeVisible();
  await expect(page.locator('[data-od-id="metrics-rail"]')).toBeVisible();

  const before = await page.evaluate(
    () => window.__BIKE_JUMPER_TEST__?.getSolveDispatchCount() ?? -1
  );
  await page.getByLabel("Entry speed").fill("8.3");
  const afterEdit = await page.evaluate(
    () => window.__BIKE_JUMPER_TEST__?.getSolveDispatchCount() ?? -1
  );
  expect(afterEdit).toBe(before);

  await page.locator("#run-solve").click();
  await expect
    .poll(async () =>
      page.evaluate(() => window.__BIKE_JUMPER_TEST__?.getSolveDispatchCount() ?? -1)
    )
    .toBe(before + 1);

  await expect(page.locator('[data-od-id="play-toggle"]')).toBeEnabled({ timeout: 20_000 });
  await page.locator('[data-od-id="play-toggle"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");

  await page.locator('[data-od-id="pin-baseline"]').click();
  await expect(page.locator('[data-od-id="baseline-card"]')).toContainText("compatible");
});

test("workbench camera follows, holds manual framing, and resets", async ({
  page,
  browserName
}) => {
  await page.goto("/workbench");

  await expect
    .poll(async () =>
      page.evaluate(() => window.__BIKE_JUMPER_TEST__?.cameraCheckpoint().modelHeightFraction ?? 0)
    )
    .toBeGreaterThanOrEqual(0.28);
  const initial = await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.cameraCheckpoint());
  expect(initial?.mode).toBe("follow");
  expect(initial?.modelHeightFraction ?? 0).toBeGreaterThanOrEqual(0.28);
  expect(initial?.modelHeightFraction ?? 1).toBeLessThanOrEqual(0.36);

  const zoomSlider = page.getByRole("slider", { name: "Camera zoom" });
  await zoomSlider.fill("1.4");
  await expect
    .poll(() => page.evaluate(() => window.__BIKE_JUMPER_TEST__?.cameraCheckpoint().zoomFactor))
    .toBe(1.4);

  const stage = page.locator('[data-od-id="sim-canvas"]');
  const box = await stage.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.55);
    await page.mouse.up();
    if (browserName !== "webkit") await page.mouse.wheel(0, -240);
  }
  await stage.focus();
  await page.keyboard.press("ArrowRight");
  const manual = await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.cameraCheckpoint());
  expect(manual?.mode).toBe("pan-zoom");

  const beforeSolve = await page.evaluate(
    () => window.__BIKE_JUMPER_TEST__?.getSolveDispatchCount() ?? -1
  );
  await page.keyboard.press("+");
  const zoomed = await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.cameraCheckpoint());
  expect(zoomed?.zoomFactor ?? 1).toBeGreaterThan(1);
  expect(
    await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.getSolveDispatchCount() ?? -1)
  ).toBe(beforeSolve);

  for (let index = 0; index < 20; index += 1) await page.keyboard.press("+");
  expect(
    (await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.cameraCheckpoint()))?.zoomFactor
  ).toBe(3);

  await zoomSlider.fill("1.4");
  await expect
    .poll(() => page.evaluate(() => window.__BIKE_JUMPER_TEST__?.cameraCheckpoint().zoomFactor))
    .toBe(1.4);
  const held = await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.cameraCheckpoint().view);
  await page.locator("#run-solve").click();
  await expect
    .poll(async () =>
      page.evaluate(() => window.__BIKE_JUMPER_TEST__?.getSolveDispatchCount() ?? 0)
    )
    .toBe(beforeSolve + 1);
  await expect
    .poll(() => page.evaluate(() => window.__BIKE_JUMPER_TEST__?.getState().solver.lifecycle))
    .toBe("ready");
  await expect
    .poll(() => page.evaluate(() => window.__BIKE_JUMPER_TEST__?.cameraCheckpoint().mode))
    .toBe("follow");
  await expect
    .poll(() => page.evaluate(() => window.__BIKE_JUMPER_TEST__?.cameraCheckpoint().zoomFactor))
    .toBe(1.4);
  await stage.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => page.evaluate(() => window.__BIKE_JUMPER_TEST__?.cameraCheckpoint().mode))
    .toBe("pan-zoom");
  const afterRunManual = await page.evaluate(
    () => window.__BIKE_JUMPER_TEST__?.cameraCheckpoint().view
  );
  expect(held).not.toEqual(afterRunManual);
  await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.seekFrame(20));
  await expect
    .poll(() => page.evaluate(() => window.__BIKE_JUMPER_TEST__?.cameraCheckpoint().view))
    .toEqual(afterRunManual);

  await page.locator('[data-od-id="camera-reset"]').click();
  const reset = await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.cameraCheckpoint());
  expect(reset?.mode).toBe("follow");
  expect(reset?.zoomFactor).toBe(1);
  await expect(zoomSlider).toHaveValue("1");
});

test("earth fill stays below the terrain while panning", async ({ page }) => {
  await page.goto("/workbench");
  const stage = page.locator('[data-od-id="sim-canvas"]');
  await expect(stage).toBeVisible();

  const sampleVisibleEarth = () =>
    page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        'canvas[aria-label="Jump simulation stage"]'
      );
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return null;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let brownColumns = 0;
      let columnsMissingBrownAtBottom = 0;
      for (let x = 0; x < canvas.width; x += 1) {
        let hasBrown = false;
        for (let y = 0; y < canvas.height; y += 1) {
          const index = (y * canvas.width + x) * 4;
          if (pixels[index] === 74 && pixels[index + 1] === 66 && pixels[index + 2] === 56) {
            hasBrown = true;
            break;
          }
        }
        if (!hasBrown) continue;
        brownColumns += 1;
        const bottomIndex = ((canvas.height - 1) * canvas.width + x) * 4;
        if (
          pixels[bottomIndex] !== 74 ||
          pixels[bottomIndex + 1] !== 66 ||
          pixels[bottomIndex + 2] !== 56
        ) {
          columnsMissingBrownAtBottom += 1;
        }
      }
      return { brownColumns, columnsMissingBrownAtBottom };
    });
  await expect
    .poll(async () => (await sampleVisibleEarth())?.brownColumns ?? 0)
    .toBeGreaterThan(100);
  const visibleEarth = await sampleVisibleEarth();
  expect(visibleEarth?.brownColumns ?? 0).toBeGreaterThan(100);
  expect(visibleEarth?.columnsMissingBrownAtBottom ?? Infinity).toBeLessThanOrEqual(2);

  await page.getByRole("button", { name: "Pan & Zoom" }).click();
  await stage.focus();
  for (let index = 0; index < 20; index += 1) await page.keyboard.press("ArrowUp");

  const brownPixels = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      'canvas[aria-label="Jump simulation stage"]'
    );
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return -1;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] === 74 && pixels[index + 1] === 66 && pixels[index + 2] === 56) count += 1;
    }
    return count;
  });
  expect(brownPixels).toBe(0);
});

test("workbench exposes deterministic contact checkpoints and touchdown transition", async ({
  page
}) => {
  await page.goto("/workbench");
  for (const id of ["input-rail", "overlay-bar", "sim-canvas", "transport", "metrics-rail"]) {
    await expect(page.locator(`[data-od-id="${id}"]`)).toBeVisible();
  }

  const touchdownFrame = await solveAndFindTouchdown(page);
  expect(touchdownFrame).toBeGreaterThan(0);

  await page.evaluate((index) => window.__BIKE_JUMPER_TEST__?.seekFrame(index), touchdownFrame - 1);
  await expect
    .poll(async () => {
      const checkpoint = await page.evaluate(() =>
        window.__BIKE_JUMPER_TEST__?.workbenchGeometryCheckpoint()
      );
      return Boolean(
        checkpoint?.touchdownIndicatorVisible ||
          checkpoint?.groundedRear ||
          checkpoint?.groundedFront
      );
    })
    .toBe(false);
  const lastAirborne = await page.evaluate(() =>
    window.__BIKE_JUMPER_TEST__?.workbenchGeometryCheckpoint()
  );
  expect(lastAirborne?.groundedRear || lastAirborne?.groundedFront).toBe(false);

  await page.evaluate((index) => window.__BIKE_JUMPER_TEST__?.seekFrame(index), touchdownFrame);
  await expect(page.locator('[data-od-id="contact-readout"]')).toHaveAttribute(
    "data-touchdown-visible",
    "true"
  );
  await expect
    .poll(async () => {
      const checkpoint = await page.evaluate(() =>
        window.__BIKE_JUMPER_TEST__?.workbenchGeometryCheckpoint()
      );
      return Boolean(checkpoint?.groundedRear || checkpoint?.groundedFront);
    })
    .toBe(true);
  const firstGrounded = await page.evaluate(() =>
    window.__BIKE_JUMPER_TEST__?.workbenchGeometryCheckpoint()
  );
  expect(firstGrounded?.groundedRear || firstGrounded?.groundedFront).toBe(true);
  expect(firstGrounded?.minClearance ?? -1).toBeGreaterThanOrEqual(-0.01);
  expect(firstGrounded?.nearestTerrainSegment?.segmentId).toBeTruthy();
  expect(firstGrounded?.nearestTerrainSegment?.distance ?? -1).toBeGreaterThanOrEqual(0);

  const canvas = await page.evaluate(
    () => window.__BIKE_JUMPER_TEST__?.sampleCanvas("Jump simulation stage") ?? null
  );
  expect(canvas?.nonTransparent ?? 0).toBeGreaterThan(1000);
  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 2);
});
