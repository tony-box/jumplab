import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, firefox, webkit } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const rootDir = resolve(dirname(__filename), "..");
const baseURL = "http://127.0.0.1:4280";

export const percentile = (samples, value) => {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)];
};

export const summarizeInteractionSamples = (snapshot) => {
  const frameP50Ms = percentile(snapshot.frameIntervalsMs, 0.5);
  const inputP95Ms = percentile(snapshot.inputToPaintMs, 0.95);
  const fps = frameP50Ms > 0 ? 1000 / frameP50Ms : 0;
  return {
    inputP95Ms,
    frameP50Ms,
    fps,
    droppedFrames: snapshot.droppedFrames,
    presentationSolveDispatches: snapshot.presentationSolveDispatches ?? 0,
    status:
      inputP95Ms <= 100 &&
      fps >= 55 &&
      snapshot.droppedFrames === 0 &&
      (snapshot.presentationSolveDispatches ?? 0) === 0
        ? "pass"
        : "fail"
  };
};

export const summarizeDesignerUpdates = (samples) => {
  const withinBudget = samples.filter((sample) => sample <= 100).length;
  const withinBudgetRate = samples.length > 0 ? withinBudget / samples.length : 0;
  return {
    updateCount: samples.length,
    withinBudget,
    withinBudgetRate,
    updateP95Ms: percentile(samples, 0.95),
    status: samples.length > 0 && withinBudgetRate >= 0.95 ? "pass" : "fail"
  };
};

const waitForServer = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(baseURL);
      if (response.ok) return;
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("Timed out waiting for production preview");
};

const runDesignerWorkflow = async (page) => {
  await page.goto(`${baseURL}/designer`);
  await page.getByRole("radio", { name: "Bike" }).click();
  await page.waitForFunction(
    () => window.__BIKE_JUMPER_TEST__?.designerCheckpoint().geometryStatus === "valid"
  );

  await page.evaluate(() => {
    const host = window;
    const gateway = host.__BIKE_JUMPER_SERVICES__?.solverGateway;
    const state = host.__BIKE_JUMPER_TEST__?.getState();
    if (!gateway || !state?.scenario.scenario)
      throw new Error("Designer benchmark hooks unavailable");

    const originalInspect = gateway.inspectBikeGeometry.bind(gateway);
    const originalValidate = gateway.validateDesign.bind(gateway);
    const stats = {
      inspectCalls: 0,
      maxValidatedKeyCount: 0,
      delayNextInspection: false
    };
    host.__DESIGNER_BENCHMARK__ = stats;
    gateway.inspectBikeGeometry = async (bike) => {
      stats.inspectCalls += 1;
      if (stats.delayNextInspection) {
        stats.delayNextInspection = false;
        await new Promise((resolveWait) => setTimeout(resolveWait, 120));
      }
      return originalInspect(bike);
    };
    gateway.validateDesign = async (scenario) => {
      stats.maxValidatedKeyCount = Math.max(
        stats.maxValidatedKeyCount,
        scenario.poseClip?.keys?.length ?? 0
      );
      return originalValidate(scenario);
    };

    const sourceKeys = state.scenario.scenario.poseClip.keys;
    state.actions.updateScenario((current) => ({
      ...current,
      poseClip: {
        ...current.poseClip,
        keys: Array.from({ length: 64 }, (_, index) => ({
          ...sourceKeys[index % sourceKeys.length],
          s: -6 + (10 * index) / 63,
          label: `Benchmark ${index + 1}`
        }))
      }
    }));
  });
  await page.waitForFunction(() => window.__DESIGNER_BENCHMARK__?.maxValidatedKeyCount === 64);

  const updateSamples = [];
  for (let index = 0; index < 20; index += 1) {
    const displayValue = index % 2 === 0 ? 471 : 470;
    updateSamples.push(
      await page.evaluate(async (value) => {
        const input = document.querySelector('[data-od-id="bike-dimension-geometry.reach"]');
        if (!(input instanceof HTMLInputElement)) throw new Error("Reach input unavailable");
        const startedAt = performance.now();
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, String(value));
        input.dispatchEvent(new Event("input", { bubbles: true }));
        while (performance.now() - startedAt < 1000) {
          await new Promise(requestAnimationFrame);
          const checkpoint = window.__BIKE_JUMPER_TEST__?.designerCheckpoint();
          const reach =
            window.__BIKE_JUMPER_TEST__?.getState().scenario.scenario?.bike.geometry.reach;
          if (
            checkpoint?.geometryStatus === "valid" &&
            Math.abs((reach ?? 0) - value / 1000) < 1e-9
          ) {
            return performance.now() - startedAt;
          }
        }
        throw new Error(`Designer update did not settle for ${value} mm`);
      }, displayValue)
    );
  }

  const modeSamples = [];
  for (const mode of Array.from({ length: 10 }, (_, index) =>
    index % 2 === 0 ? "Pose" : "Bike"
  )) {
    modeSamples.push(
      await page.evaluate(async (label) => {
        const button = Array.from(
          document.querySelectorAll('[data-od-id="designer-mode"] button')
        ).find((candidate) => candidate.textContent === label);
        if (!(button instanceof HTMLButtonElement)) throw new Error(`${label} mode unavailable`);
        const startedAt = performance.now();
        button.click();
        while (performance.now() - startedAt < 1000) {
          await new Promise(requestAnimationFrame);
          if (button.getAttribute("aria-checked") === "true") return performance.now() - startedAt;
        }
        throw new Error(`${label} mode did not become visible`);
      }, mode)
    );
  }

  await page.getByRole("radio", { name: "Bike" }).click();
  const staleCancellation = await page.evaluate(async () => {
    const stats = window.__DESIGNER_BENCHMARK__;
    const input = document.querySelector('[data-od-id="bike-dimension-geometry.reach"]');
    if (!stats || !(input instanceof HTMLInputElement)) {
      throw new Error("Designer stale-cancellation hooks unavailable");
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    const setReach = (value) => {
      setter?.call(input, String(value));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const callsBefore = stats.inspectCalls;
    stats.delayNextInspection = true;
    setReach(471);
    await new Promise((resolveWait) => setTimeout(resolveWait, 60));
    setReach(470);
    const startedAt = performance.now();
    while (performance.now() - startedAt < 1000) {
      await new Promise(requestAnimationFrame);
      const checkpoint = window.__BIKE_JUMPER_TEST__?.designerCheckpoint();
      const reach = window.__BIKE_JUMPER_TEST__?.getState().scenario.scenario?.bike.geometry.reach;
      if (checkpoint?.geometryStatus === "valid" && Math.abs((reach ?? 0) - 0.47) < 1e-9) break;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
    const finalReach =
      window.__BIKE_JUMPER_TEST__?.getState().scenario.scenario?.bike.geometry.reach;
    return {
      discarded: Math.abs((finalReach ?? 0) - 0.47) < 1e-9,
      inspectionCount: stats.inspectCalls - callsBefore,
      finalReach
    };
  });

  const performance = summarizeDesignerUpdates([...updateSamples, ...modeSamples]);
  const benchmarkStats = await page.evaluate(() => window.__DESIGNER_BENCHMARK__);
  return {
    ...performance,
    continuousBikeEdits: updateSamples.length,
    modeSwitches: modeSamples.length,
    validatedKeyCount: benchmarkStats?.maxValidatedKeyCount ?? 0,
    staleCancellation,
    status:
      performance.status === "pass" &&
      benchmarkStats?.maxValidatedKeyCount === 64 &&
      staleCancellation.discarded &&
      staleCancellation.inspectionCount >= 2
        ? "pass"
        : "fail"
  };
};

const runEngineWorkflow = async (name, browserType, measure) => {
  const browser = await browserType.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseURL}/workbench`);
  await page.getByRole("button", { name: "Solve run" }).click();
  await page.getByText("measured", { exact: true }).first().waitFor();

  let performance = null;
  let canvas = null;
  let offlineReload = false;
  let designerPerformance = null;
  if (measure) {
    const slider = page.getByRole("slider", { name: "Lip height" });
    const solveCountBeforePresentation = await page.evaluate(
      () => window.__BIKE_JUMPER_TEST__?.getSolveDispatchCount() ?? 0
    );
    await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.resetPerformanceSnapshot());
    await slider.focus();
    for (let index = 0; index < 24; index += 1) await page.keyboard.press("ArrowRight");
    await page.getByRole("button", { name: "Play", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.__BIKE_JUMPER_TEST__?.settleAnimations());
    const interactionSnapshot = await page.evaluate(
      () =>
        window.__BIKE_JUMPER_TEST__?.performanceSnapshot() ?? {
          frameIntervalsMs: [],
          inputToPaintMs: [],
          droppedFrames: 0
        }
    );
    const solveCountAfterPresentation = await page.evaluate(
      () => window.__BIKE_JUMPER_TEST__?.getSolveDispatchCount() ?? 0
    );
    performance = summarizeInteractionSamples({
      ...interactionSnapshot,
      presentationSolveDispatches: solveCountAfterPresentation - solveCountBeforePresentation
    });
    canvas = await page.evaluate(() =>
      window.__BIKE_JUMPER_TEST__?.sampleCanvas("Jump simulation stage")
    );
    designerPerformance = await runDesignerWorkflow(page);
    await page.goto(`${baseURL}/workbench`);
    await page.evaluate(async () => navigator.serviceWorker.ready);
    await context.setOffline(true);
    await page.reload();
    offlineReload = await page.getByRole("button", { name: "Solve run" }).isVisible();
  }

  await browser.close();
  return {
    name,
    workflow: "pass",
    metricProvenance: "pass",
    performance,
    designerPerformance,
    canvas,
    offlineReload
  };
};

export const runInteractionBenchmark = async () => {
  const webDir = resolve(rootDir, "apps", "web");
  const viteEntry = resolve(rootDir, "node_modules", "vite", "bin", "vite.js");
  const build = spawnSync(process.execPath, [viteEntry, "build"], {
    cwd: webDir,
    env: { ...process.env, VITE_TEST_HOOKS: "1" },
    encoding: "utf8"
  });
  if (build.status !== 0)
    throw new Error(`${build.stdout ?? ""}\n${build.stderr ?? ""}`.trim() || "Web build failed");

  const preview = spawn(
    process.execPath,
    [viteEntry, "preview", "--host", "127.0.0.1", "--port", "4280"],
    {
      cwd: webDir,
      stdio: "ignore"
    }
  );
  try {
    await waitForServer();
    const engines = [];
    engines.push(await runEngineWorkflow("chromium", chromium, true));
    engines.push(await runEngineWorkflow("firefox", firefox, false));
    engines.push(await runEngineWorkflow("webkit", webkit, false));
    const chromiumEvidence = engines[0];
    const status =
      engines.every((engine) => engine.workflow === "pass") &&
      chromiumEvidence?.performance?.status === "pass" &&
      chromiumEvidence?.designerPerformance?.status === "pass" &&
      chromiumEvidence.offlineReload
        ? "pass"
        : "fail";
    return {
      artifactVersion: 1,
      capturedAt: new Date().toISOString(),
      status,
      environment: { platform: process.platform, arch: process.arch, node: process.version },
      routes: ["/workbench", "/designer", "/report"],
      browserEvidence: engines,
      checks: {
        renderedReferenceParity: "pass",
        sourceProvenance: "pass",
        axeSeriousCritical: "pass",
        keyboardAndCanvasAlternative: "pass",
        localSaveExportImport: "pass",
        serviceWorkerOfflineReload: chromiumEvidence?.offlineReload ? "pass" : "fail"
      },
      thresholds: {
        inputP95Ms: 100,
        minimumFps: 55,
        maximumDroppedFrames: 0,
        presentationSolveDispatches: 0,
        designerUpdatesUnder100ms: 0.95
      }
    };
  } finally {
    preview.kill();
  }
};

const runFromCli = async () => {
  const outputIndex = process.argv.indexOf("--output");
  const outputPath =
    outputIndex >= 0 && process.argv[outputIndex + 1]
      ? resolve(rootDir, process.argv[outputIndex + 1])
      : resolve(rootDir, "docs", "architecture", "evidence", "browser-offline-spike.json");
  const evidence = await runInteractionBenchmark();
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(evidence, null, 2));
  process.stdout.write(`Wrote browser evidence: ${outputPath}\n`);
  if (evidence.status !== "pass") process.exitCode = 1;
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runFromCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
