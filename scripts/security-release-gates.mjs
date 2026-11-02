import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
execFileSync("node", ["scripts/check-dependencies.mjs", ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit"
});

const excluded = new Set([
  "node_modules",
  "target",
  "dist",
  ".git",
  "test-results",
  "playwright-report"
]);
const allowedExtensions = new Set([
  ".js",
  ".mjs",
  ".ts",
  ".tsx",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".toml"
]);
const secretPattern =
  /(?:AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][^"']{12,}["'])/i;
const findings = [];
const scan = (directory) => {
  for (const entry of readdirSync(directory)) {
    if (excluded.has(entry)) continue;
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) scan(path);
    else if (allowedExtensions.has(extname(path)) && secretPattern.test(readFileSync(path, "utf8")))
      findings.push(path.slice(root.length + 1));
  }
};
scan(root);
if (findings.length > 0) throw new Error(`Potential committed secrets: ${findings.join(", ")}`);
const gates = [
  "lockfile",
  "licenses",
  ...(process.argv.includes("--check-only") ? [] : ["SBOM"]),
  ...(process.argv.includes("--audit") ? ["vulnerabilities"] : []),
  "secret scan"
];
console.log(`Security release gates passed: ${gates.join(", ")}.`);
