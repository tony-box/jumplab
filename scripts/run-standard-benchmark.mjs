import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import { Worker } from "node:worker_threads";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");

const scenarioPath = resolve(rootDir, "tests", "fixtures", "scenarios", "standard-v1.json");
const nodePkgDir = resolve(rootDir, "crates", "physics-core", "pkg-benchmark-node");
const nodePkgEntrypoint = resolve(nodePkgDir, "physics_core.js");
const require = createRequire(nodePkgEntrypoint);

const SOLVE_BUDGET_MS = 1_000;
const CANCEL_BUDGET_MS = 250;

const percentile = (samples, p) => {
  if (samples.length === 0) {
    return 0;
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
};

const ensureNodeWasmPackage = () => {
  const build = spawnSync(
    "wasm-pack",
    [
      "build",
      "crates/physics-core",
      "--target",
      "nodejs",
      "--out-dir",
      "pkg-benchmark-node",
      "--out-name",
      "physics_core"
    ],
    {
      cwd: rootDir,
      encoding: "utf8"
    }
  );

  if (build.status !== 0) {
    throw new Error(build.stderr || build.stdout || "Failed to build Node WASM benchmark package");
  }
};

const measureCancellation = (scenarioJson, runId) =>
  new Promise((resolveCancellation, rejectCancellation) => {
    const worker = new Worker(
      `
        const { parentPort, workerData } = require("node:worker_threads");
        const wasm = require(workerData.entrypoint);
        Promise.resolve().then(() => {
          parentPort.postMessage({ type: "ready" });
          parentPort.on("message", () => {
            parentPort.postMessage({ type: "started" });
            wasm.solve(workerData.scenarioJson, workerData.runId);
          });
        }).catch((error) => {
          throw error;
        });
      `,
      {
        eval: true,
        workerData: {
          entrypoint: nodePkgEntrypoint,
          scenarioJson,
          runId
        }
      }
    );

    let cancellationStarted = 0;
    worker.on("message", (message) => {
      if (message.type === "ready") {
        worker.postMessage({ type: "solve" });
        return;
      }

      if (message.type === "started") {
        cancellationStarted = performance.now();
        worker.terminate().then(() => {
          resolveCancellation(performance.now() - cancellationStarted);
        }, rejectCancellation);
      }
    });
    worker.on("error", rejectCancellation);
  });

export const runStandardBenchmark = async (options = {}) => {
  const runs = Number.isFinite(options.runs) ? Math.max(1, options.runs) : 20;

  ensureNodeWasmPackage();

  const scenario = JSON.parse(readFileSync(scenarioPath, "utf8"));
  const wasm = require(nodePkgEntrypoint);

  const solveSamples = [];
  const cancellationSamples = [];
  const scenarioJson = JSON.stringify(scenario);

  for (let index = 0; index < runs; index += 1) {
    const runId = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const start = performance.now();
    wasm.solve(scenarioJson, runId).free();
    const elapsed = performance.now() - start;
    solveSamples.push(elapsed);

    cancellationSamples.push(await measureCancellation(scenarioJson, `${runId}-cancel`));
  }

  const solveP95Ms = percentile(solveSamples, 95);
  const cancellationP95Ms = percentile(cancellationSamples, 95);
  const solveStatus = solveP95Ms < SOLVE_BUDGET_MS ? "pass" : "fail";
  const cancelStatus = cancellationP95Ms < CANCEL_BUDGET_MS ? "pass" : "fail";

  // Only measured values are reported; correctness evidence lives in the test suites.
  return {
    artifactVersion: 3,
    benchmarkVersion: 2,
    capturedAt: new Date().toISOString(),
    status: solveStatus === "pass" && cancelStatus === "pass" ? "pass" : "fail",
    environment: {
      platform: process.platform,
      arch: process.arch,
      node: process.version
    },
    runs,
    solve: {
      samplesMs: solveSamples,
      p50Ms: percentile(solveSamples, 50),
      p95Ms: solveP95Ms,
      budgetMs: SOLVE_BUDGET_MS,
      status: solveStatus
    },
    cancel: {
      samplesMs: cancellationSamples,
      p50Ms: percentile(cancellationSamples, 50),
      p95Ms: cancellationP95Ms,
      budgetMs: CANCEL_BUDGET_MS,
      status: cancelStatus,
      mechanism: "Terminating a worker thread while it runs the real Node WASM solve."
    }
  };
};
const runFromCli = async () => {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf("--output");
  const runsIndex = args.indexOf("--runs");

  const outputPath =
    outputIndex >= 0 && args[outputIndex + 1]
      ? resolve(rootDir, args[outputIndex + 1])
      : resolve(rootDir, "docs", "architecture", "evidence", "physics-spike.json");

  const runs = runsIndex >= 0 && args[runsIndex + 1] ? Number(args[runsIndex + 1]) : 20;
  const report = await runStandardBenchmark({ runs });

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(
    `Solve p95 ${report.solve.p95Ms.toFixed(0)} ms, cancel p95 ${report.cancel.p95Ms.toFixed(0)} ms: ${report.status}\n`
  );
  if (report.status !== "pass") process.exitCode = 1;
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runFromCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
