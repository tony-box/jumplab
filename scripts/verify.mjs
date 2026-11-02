import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

const root = resolve(import.meta.dirname, "..");
// Verification output stays in the gitignored test-results/ tree; committed evidence under
// docs/architecture/evidence is only refreshed by the dedicated benchmark/evidence scripts.
const outputDir = "test-results/verify";
const prebuilt = { PLAYWRIGHT_PREBUILT: "1" };

// Each artifact is built exactly once: WASM by build:physics, the web bundle (with test hooks,
// which every browser check needs) by the web build. Later steps reuse them.
const steps = [
  ["static-checks", "npm", ["run", "check"]],
  ["rust-format", "cargo", ["fmt", "--check"]],
  [
    "rust-clippy",
    "cargo",
    ["clippy", "-p", "physics-core", "--all-targets", "--", "-D", "warnings"]
  ],
  ["physics-build", "npm", ["run", "build:physics"]],
  ["web-build", "npm", ["run", "build"], { VITE_TEST_HOOKS: "1" }],
  ["rust-tests", "cargo", ["test", "-p", "physics-core", "--release"]],
  [
    "unit-contract-tests",
    "npx",
    [
      "vitest",
      "run",
      "--project",
      "web-unit",
      "--project",
      "schema-unit",
      "--project",
      "contracts",
      "--project",
      "benchmarks",
      "--exclude",
      "tests/benchmarks/standard-scenario.bench.ts"
    ]
  ],
  ["native-wasm-browser-parity", "npm", ["run", "test:parity"]],
  ["browser-workflows", "npm", ["run", "test:e2e"], prebuilt],
  ["visual", "npm", ["run", "test:visual"], prebuilt],
  ["accessibility", "npm", ["run", "test:a11y"], prebuilt],
  ["offline", "npm", ["run", "test:offline"], prebuilt],
  [
    "physics-benchmark",
    "node",
    ["scripts/run-standard-benchmark.mjs", "--output", `${outputDir}/physics-spike.json`]
  ],
  [
    "interaction-benchmark",
    "node",
    [
      "scripts/run-interaction-benchmark.mjs",
      "--skip-build",
      "--output",
      `${outputDir}/browser-offline-spike.json`
    ]
  ],
  ["security", "node", ["scripts/security-release-gates.mjs", "--audit", "--check-only"]],
  [
    "compatibility",
    "node",
    [
      "scripts/generate-compatibility-report.mjs",
      "--output",
      `${outputDir}/compatibility-report.json`
    ]
  ]
];

mkdirSync(resolve(root, outputDir), { recursive: true });
const writeSummary = (status, outcomes) => {
  const path = resolve(root, outputDir, "quickstart-validation.json");
  writeFileSync(
    path,
    `${JSON.stringify({ schemaVersion: 2, generatedAt: new Date().toISOString(), status, outcomes }, null, 2)}\n`
  );
  return path;
};

const outcomes = [];
for (const [id, command, args, env = {}] of steps) {
  process.stdout.write(`\n== ${id} ==\n`);
  const started = performance.now();
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env },
    shell: process.platform === "win32"
  });
  const status = result.status === 0 ? "pass" : "fail";
  outcomes.push({
    id,
    command: [command, ...args].join(" "),
    status,
    durationMs: Math.round(performance.now() - started)
  });
  if (status === "fail") {
    const summary = writeSummary("fail", outcomes);
    console.error(`\nVerification failed at ${id}. Summary: ${summary}`);
    process.exit(result.status ?? 1);
  }
}

const summary = writeSummary("pass", outcomes);
console.log(
  `\nAll ${outcomes.length} automated checks passed. Summary: ${summary}\n` +
    "External gates (real Safari, iPadOS, Android Chrome, reviewer exercise, maintainer sign-off) are not covered."
);
