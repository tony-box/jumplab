import { expect, test } from "@playwright/test";
import standardRun from "../fixtures/run-results/standard-v2.json" with { type: "json" };
import {
  FRAME_LAYOUT_FIELDS,
  FRAME_LAYOUT_VERSION,
  FRAME_STRIDE_FLOAT32
} from "../../packages/schema/src/index";

const seedReportRuns = async (page: Parameters<typeof test>[0]["page"]) => {
  return page.evaluate(
    async ({ fixtureManifest, frameLayoutFields, frameLayoutVersion, frameStrideFloat32 }) => {
      const scenario = window.__BIKE_JUMPER_TEST__?.getState().scenario.scenario;
      const services = (
        window as Window & {
          __BIKE_JUMPER_SERVICES__?: {
            runArtifactRepository?: {
              list: () => Promise<Array<{ runId: string }>>;
              remove: (runId: string) => Promise<void>;
              save: (artifact: unknown) => Promise<unknown>;
            };
          };
        }
      ).__BIKE_JUMPER_SERVICES__;
      if (!scenario) {
        throw new Error("Scenario was not initialized");
      }
      const repository = services?.runArtifactRepository;
      if (!repository) {
        throw new Error("Run artifact repository was not exposed for tests");
      }

      const runIds = [
        "71111111-1111-4111-8111-111111111111",
        "72222222-2222-4222-8222-222222222222"
      ];

      const makeArtifact = (runId: string, variant: number) => {
        const scenarioHash = "a".repeat(64 - String(variant).length) + String(variant);
        const resultHash = "b".repeat(64 - String(variant).length) + String(variant);
        const frameData = new Float32Array(frameStrideFloat32 * 3);
        frameData.set([0, 10 + variant, 1 + variant * 0.1, 0.1, 8.0, 2.0, 0, 0.2, 0.1, 0.1], 0);
        frameData.set(
          [1, 11 + variant, 2 + variant * 0.1, 0.2, 8.1, 1.5, 1, 0.3, 0.1, 0.1],
          frameStrideFloat32
        );
        frameData.set(
          [2, 12 + variant, 1.6 + variant * 0.1, 0.15, 8.2, -0.2, 1, 0.1, 0.1, 0.1],
          frameStrideFloat32 * 2
        );
        const telemetryData = new Float32Array(3 * fixtureManifest.telemetry.strideFloat32).fill(
          3 + variant
        );

        return {
          runId,
          createdAt: new Date(Date.now() + variant * 1000).toISOString(),
          source: "solver",
          scenarioSnapshot: scenario,
          scenarioHash,
          model: {
            scenarioSchemaVersion: 1,
            solverVersion: variant === 1 ? "rapier-0.35.2-enhanced-determinism" : "rapier-0.36.0",
            modelVersion: "physics-spike-v1",
            assumptionsId: "default-assumptions-v1",
            unitSystemId: "si-v1",
            metricDefinitionVersion: "core-metrics-v1",
            terrainSampleStep: 0.1
          },
          manifest: {
            runId,
            scenarioHash,
            solverVersion: variant === 1 ? "rapier-0.35.2-enhanced-determinism" : "rapier-0.36.0",
            frameLayout: {
              version: frameLayoutVersion,
              strideFloat32: frameStrideFloat32,
              fields: frameLayoutFields
            },
            frameCount: 3,
            outputHz: 120,
            phases: [
              { name: "approach", startFrame: 0, endFrame: 0 },
              { name: "takeoff", startFrame: 1, endFrame: 1 },
              { name: "flight", startFrame: 2, endFrame: 2 }
            ],
            metrics: {
              ...fixtureManifest.metrics,
              airtime: {
                value: 0.82 + variant * 0.01,
                unit: "s",
                source: "measured",
                reason: null
              }
            },
            landing: fixtureManifest.landing,
            telemetry: { ...fixtureManifest.telemetry, sampleCount: 3 },
            resultHash
          },
          frameBuffer: frameData.buffer,
          telemetryBuffer: telemetryData.buffer
        };
      };

      const listed = await repository.list();
      await Promise.all(listed.map((entry) => repository.remove(entry.runId)));
      await repository.save(makeArtifact(runIds[0], 1));
      await repository.save(makeArtifact(runIds[1], 2));

      return runIds;
    },
    {
      fixtureManifest: standardRun,
      frameLayoutFields: FRAME_LAYOUT_FIELDS.map((field) => ({ ...field })),
      frameLayoutVersion: FRAME_LAYOUT_VERSION,
      frameStrideFloat32: FRAME_STRIDE_FLOAT32
    }
  );
};

test("report route, selector, source, delta, export, stale reference, and open-workbench workflow", async ({
  page
}) => {
  await page.goto("/workbench");
  await expect
    .poll(async () =>
      page.evaluate(() => Boolean(window.__BIKE_JUMPER_TEST__?.getState().scenario.scenario))
    )
    .toBe(true);
  const runIds = await seedReportRuns(page);
  const runId = runIds[0];
  expect(runId).toBeTruthy();

  await page.goto(`/report/${runId}`);

  await expect(page.locator('[data-od-id="report-header"]')).toBeVisible();
  await expect(page.locator('[data-od-id="run-compare"]')).toBeVisible();
  await expect(page.locator('[data-od-id="headline-stats"]')).toBeVisible();
  await expect(page.locator('[data-od-id="charts"]')).toBeVisible();
  await expect(page.locator('[data-od-id="metric-table"]')).toBeVisible();
  await expect(page.locator('[data-od-id="energy-table"]')).toBeVisible();
  await expect(page.locator('[data-od-id="accuracy-bounds"]')).toBeVisible();
  await expect(page.locator('[data-od-id="export-csv"]')).toBeEnabled();

  await page.getByLabel("Select baseline").selectOption(runIds[1]);
  await expect(page.locator('[data-od-id="solver-version-warning"]')).toBeVisible();

  const deltaCells = page.locator('[data-od-id="metric-table"] td[data-od-id^="delta-"]');
  await expect(deltaCells.first()).toContainText(/[+-]|\u2014|\s/);

  await page.locator('[data-od-id="export-csv"]').click();

  await page.locator('[data-od-id="open-workbench"]').click();
  await expect(page).toHaveURL(/\/workbench$/);

  const postOpenRunState = await page.evaluate(
    () => window.__BIKE_JUMPER_TEST__?.getState().scenario.resultState ?? null
  );
  expect(postOpenRunState).toBe("none");

  await page.goto("/report/00000000-0000-4000-8000-000000000000");
  await expect(page.locator('[data-od-id="report-missing"]')).toBeVisible();
});
