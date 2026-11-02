import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { chromium, firefox, webkit } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..", "..");
const crateDir = resolve(rootDir, "crates", "physics-core");
const scenarioPath = resolve(rootDir, "tests", "fixtures", "scenarios", "standard-v1.json");
const scenario = JSON.parse(readFileSync(scenarioPath, "utf8"));
const runId = "11111111-1111-4111-8111-111111111111";

type ParityOutput = {
  resultHash: string;
  pose: unknown;
  speedWindow: unknown;
  terrain?: unknown;
  geometry?: unknown;
  designValidation?: unknown;
};

type TerrainProfile = {
  segments: Array<{ id: string; kind: string; points: number[][] }>;
  approachStartX: number;
  lipX: number;
  landingStartX: number;
  sampleStep: number;
};

const expectTerrainClose = (actual: TerrainProfile, expected: TerrainProfile) => {
  expect(actual.segments.map(({ id, kind }) => ({ id, kind }))).toEqual(
    expected.segments.map(({ id, kind }) => ({ id, kind }))
  );
  for (const key of ["approachStartX", "lipX", "landingStartX", "sampleStep"] as const) {
    expect(actual[key]).toBeCloseTo(expected[key], 6);
  }
  for (const [segmentIndex, segment] of actual.segments.entries()) {
    expect(segment.points).toHaveLength(expected.segments[segmentIndex].points.length);
    for (const [pointIndex, point] of segment.points.entries()) {
      expect(point[0]).toBeCloseTo(expected.segments[segmentIndex].points[pointIndex][0], 5);
      expect(point[1]).toBeCloseTo(expected.segments[segmentIndex].points[pointIndex][1], 5);
    }
  }
};

const withoutTerrain = ({ resultHash, pose, speedWindow }: ParityOutput): ParityOutput => ({
  resultHash,
  pose,
  speedWindow
});

const normalizeFloatPrecision = (value: unknown): unknown => {
  if (typeof value === "number") {
    return Number(value.toFixed(5));
  }
  if (Array.isArray(value)) {
    return value.map(normalizeFloatPrecision);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, normalizeFloatPrecision(nested)])
    );
  }
  return value;
};

let nativeOutput: ParityOutput;
let nodeOutput: ParityOutput;
let nodeTerrainProfileJson: unknown;
let nodeInspectBikeGeometry: unknown;
let nodeValidateDesignJson: unknown;
let server: Server;
let browserOrigin: string;

const runChecked = (command: string, args: string[]) => {
  const result = spawnSync(command, args, { cwd: rootDir, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} failed`);
  }
  return result.stdout.trim();
};

const buildWasm = (target: "nodejs" | "web", outDir: string) => {
  runChecked("wasm-pack", [
    "build",
    "crates/physics-core",
    "--target",
    target,
    "--out-dir",
    outDir,
    "--out-name",
    "physics_core"
  ]);
};

const listen = (httpServer: Server) =>
  new Promise<void>((resolveListen, rejectListen) => {
    httpServer.once("error", rejectListen);
    httpServer.listen(0, "127.0.0.1", () => resolveListen());
  });

const close = (httpServer: Server) =>
  new Promise<void>((resolveClose, rejectClose) => {
    httpServer.close((error) => (error ? rejectClose(error) : resolveClose()));
  });

describe("physics parity", () => {
  beforeAll(async () => {
    buildWasm("web", "pkg");
    buildWasm("nodejs", "pkg-node");

    nativeOutput = JSON.parse(
      runChecked("cargo", [
        "run",
        "-q",
        "--release",
        "-p",
        "physics-core",
        "--bin",
        "parity_probe",
        "--",
        scenarioPath
      ])
    );

    const nodeWasm = await import(
      pathToFileURL(resolve(crateDir, "pkg-node", "physics_core.js")).href
    );
    nodeTerrainProfileJson = Reflect.get(nodeWasm, "terrainProfileJson");
    nodeInspectBikeGeometry = Reflect.get(nodeWasm, "inspectBikeGeometry");
    nodeValidateDesignJson = Reflect.get(nodeWasm, "validateDesignJson");
    nodeOutput = {
      resultHash: JSON.parse(nodeWasm.solve(JSON.stringify(scenario), runId).manifest).resultHash,
      pose: JSON.parse(
        nodeWasm.samplePoseJson(
          JSON.stringify(scenario.poseClip),
          -1,
          JSON.stringify(scenario.rider),
          JSON.stringify(scenario.bike)
        )
      ),
      speedWindow: JSON.parse(nodeWasm.analyzeSpeedWindowJson(JSON.stringify(scenario))),
      geometry: JSON.parse(nodeWasm.inspectBikeGeometry(JSON.stringify(scenario.bike))),
      designValidation: JSON.parse(nodeWasm.validateDesignJson(JSON.stringify(scenario)))
    };

    server = createServer((request, response) => {
      if (request.url === "/") {
        response.setHeader("Content-Type", "text/html");
        response.end(`
          <script type="module">
            import init, * as wasm from "/physics_core.js";
            await init("/physics_core_bg.wasm");
            globalThis.physicsWasm = wasm;
          </script>
        `);
        return;
      }

      const requestedFile =
        request.url === "/physics_core_bg.wasm" ? "physics_core_bg.wasm" : "physics_core.js";
      response.setHeader(
        "Content-Type",
        requestedFile.endsWith(".wasm") ? "application/wasm" : "text/javascript"
      );
      response.end(readFileSync(resolve(crateDir, "pkg", requestedFile)));
    });
    await listen(server);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Parity HTTP server did not expose a TCP address");
    }
    browserOrigin = `http://127.0.0.1:${address.port}`;
  }, 600_000);

  afterAll(async () => {
    if (server) {
      await close(server);
    }
  });

  it("matches native and Node WASM outputs", () => {
    expect(withoutTerrain(nodeOutput)).toEqual(withoutTerrain(nativeOutput));
  });

  it("matches native terrain output and is byte-deterministic across repeated WASM calls", () => {
    expect(
      nodeTerrainProfileJson,
      "terrainProfileJson must be exported by the WebAssembly module"
    ).toBeTypeOf("function");
    expect(nativeOutput, "parity_probe must include its native terrain output").toHaveProperty(
      "terrain"
    );

    if (typeof nodeTerrainProfileJson !== "function" || nativeOutput.terrain === undefined) {
      return;
    }

    const first = nodeTerrainProfileJson(JSON.stringify(scenario), 0.05) as string;
    const repeated = nodeTerrainProfileJson(JSON.stringify(scenario), 0.05) as string;

    expect(repeated).toBe(first);
    expectTerrainClose(JSON.parse(first) as TerrainProfile, nativeOutput.terrain as TerrainProfile);
  });

  it("matches canonical geometry and is byte-deterministic across repeated WASM calls", () => {
    expect(
      nodeInspectBikeGeometry,
      "inspectBikeGeometry must be exported by the WebAssembly module"
    ).toBeTypeOf("function");
    expect(nativeOutput, "parity_probe must include native geometry inspection").toHaveProperty(
      "geometry"
    );

    if (typeof nodeInspectBikeGeometry !== "function" || nativeOutput.geometry === undefined) {
      return;
    }

    const first = nodeInspectBikeGeometry(JSON.stringify(scenario.bike)) as string;
    const repeated = nodeInspectBikeGeometry(JSON.stringify(scenario.bike)) as string;
    const geometry = JSON.parse(first);

    expect(repeated).toBe(first);
    expect(normalizeFloatPrecision(geometry)).toEqual(
      normalizeFloatPrecision(nativeOutput.geometry)
    );
    expect(geometry.landmarks).toMatchObject({
      rearAxle: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      bottomBracket: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      frontAxle: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) })
    });
    expect(geometry.closureResidual).toBeLessThanOrEqual(0.01);
    expect(geometry.massProperties.centerOfGravity).toEqual({
      x: expect.any(Number),
      y: expect.any(Number)
    });
    expect(geometry.massProperties.planarInertia).toBeGreaterThan(0);
  });

  it("matches complete authored-key validation and is byte-deterministic", () => {
    expect(nodeValidateDesignJson).toBeTypeOf("function");
    expect(nativeOutput).toHaveProperty("designValidation");
    if (typeof nodeValidateDesignJson !== "function") return;

    const first = nodeValidateDesignJson(JSON.stringify(scenario)) as string;
    const repeated = nodeValidateDesignJson(JSON.stringify(scenario)) as string;
    const validation = JSON.parse(first);

    expect(repeated).toBe(first);
    expect(normalizeFloatPrecision(validation)).toEqual(
      normalizeFloatPrecision(nativeOutput.designValidation)
    );
    expect(validation.poseKeys).toHaveLength(scenario.poseClip.keys.length);
    expect(validation.poseKeys.map((key: { keyIndex: number }) => key.keyIndex)).toEqual(
      scenario.poseClip.keys.map((_: unknown, index: number) => index)
    );
  });

  it("matches native outputs in Chromium, Firefox, and WebKit", async () => {
    for (const browserType of [chromium, firefox, webkit]) {
      const browser = await browserType.launch({ headless: true });
      try {
        const page = await browser.newPage();
        await page.goto(browserOrigin);
        await page.waitForFunction(() => "physicsWasm" in globalThis);
        const browserOutput = await page.evaluate(
          async ({ fixture, parityRunId }) => {
            const wasm = Reflect.get(globalThis, "physicsWasm");
            return {
              resultHash: JSON.parse(wasm.solve(JSON.stringify(fixture), parityRunId).manifest)
                .resultHash,
              pose: JSON.parse(
                wasm.samplePoseJson(
                  JSON.stringify(fixture.poseClip),
                  -1,
                  JSON.stringify(fixture.rider),
                  JSON.stringify(fixture.bike)
                )
              ),

              geometry: JSON.parse(wasm.inspectBikeGeometry(JSON.stringify(fixture.bike))),
              designValidation: JSON.parse(wasm.validateDesignJson(JSON.stringify(fixture)))
            };
          },
          { fixture: scenario, parityRunId: runId }
        );
        // The speed-window sweep runs dozens of solves; Node already proves its parity.
        expect(withoutTerrain({ ...browserOutput, speedWindow: nativeOutput.speedWindow })).toEqual(
          withoutTerrain(nativeOutput)
        );
        expect(normalizeFloatPrecision(browserOutput.geometry)).toEqual(
          normalizeFloatPrecision(nativeOutput.geometry)
        );
        expect(normalizeFloatPrecision(browserOutput.designValidation)).toEqual(
          normalizeFloatPrecision(nativeOutput.designValidation)
        );
      } finally {
        await browser.close();
      }
    }
  }, 120_000);
});
