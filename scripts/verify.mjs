import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

const root = resolve(import.meta.dirname, "..");
const checks = [
  ["static-checks", "npm", ["run", "check"]],
  ["physics-build", "npm", ["run", "build:physics"]],
  ["production-build", "npm", ["run", "build"]],
  ["unit-contract-benchmark-tests", "npm", ["run", "test:unit"]],
  ["physics-tests", "npm", ["run", "test:physics"]],
  ["convergence", "npm", ["run", "test:convergence"]],
  ["native-wasm-browser-parity", "npm", ["run", "test:parity"]],
  ["determinism", "npm", ["run", "test:determinism"]],
  ["worker-contract", "npm", ["run", "test:worker"]],
  ["persistence", "npm", ["run", "test:persistence"]],
  ["browser-workflows", "npm", ["run", "test:e2e"]],
  ["visual", "npm", ["run", "test:visual"]],
  ["accessibility", "npm", ["run", "test:a11y"]],
  ["offline", "npm", ["run", "test:offline"]],
  ["physics-benchmark", "npm", ["run", "benchmark:standard"]],
  ["interaction-benchmark", "npm", ["run", "benchmark:interaction"]],
  ["security", "node", ["scripts/security-release-gates.mjs", "--audit"]],
  ["compatibility-evidence", "node", ["scripts/generate-compatibility-report.mjs"]],
  ["final-evidence", "node", ["scripts/generate-final-evidence.mjs"]],
  ["decision-validation", "npm", ["run", "validate:decision"]]
];

const outcomes = [];
for (const [id, command, args] of checks) {
  process.stdout.write(`\n== ${id} ==\n`);
  const started = performance.now();
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
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
    writeFileSync(
      resolve(root, "docs/architecture/evidence/quickstart-validation.json"),
      `${JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), status: "fail", outcomes }, null, 2)}\n`
    );
    process.exit(result.status ?? 1);
  }
}

const externalApprovalGates = [
  "Independent timed reviewer exercise",
  "Real Safari stable/previous",
  "Real iPadOS Safari",
  "Real Android Chrome",
  "Explicit final maintainer sign-off"
];
writeFileSync(
  resolve(root, "docs/architecture/evidence/quickstart-validation.json"),
  `${JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), status: "automated-pass", outcomes, externalApprovalGates }, null, 2)}\n`
);
console.log(
  "\nAll automated verification passed. External approval gates remain recorded in evidence."
);
