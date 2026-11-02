import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outputIndex = process.argv.indexOf("--output");
const outputPath = resolve(
  root,
  outputIndex >= 0 && process.argv[outputIndex + 1]
    ? process.argv[outputIndex + 1]
    : "docs/architecture/evidence/compatibility-report.json"
);
const { compatibilityRegistry, resolveMigrationPath } = await import(
  "../packages/schema/dist/migrations/compatibility.js"
);

const rejects = (kind, version) => {
  try {
    resolveMigrationPath(kind, version);
    return false;
  } catch {
    return true;
  }
};

const boundaries = {};
const checks = [];
for (const [kind, entries] of Object.entries(compatibilityRegistry)) {
  const current = entries.filter((entry) => entry.status === "current");
  checks.push({
    id: `${kind}:single-current-version`,
    passed: current.length === 1,
    observed: current.map((entry) => entry.version)
  });

  boundaries[kind] = entries.map((entry) => {
    let migrationPath = null;
    let error = null;
    try {
      migrationPath = resolveMigrationPath(kind, entry.version);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    const terminal = migrationPath ? entries.find((e) => e.version === migrationPath.at(-1)) : null;
    // "regenerate" versions are accepted but never converted; their runs are re-solved instead.
    checks.push(
      entry.status === "regenerate"
        ? {
            id: `${kind}:v${entry.version}:accepted-for-regeneration`,
            passed: migrationPath?.length === 1 && entry.migratesTo === null,
            observed: migrationPath ?? error
          }
        : {
            id: `${kind}:v${entry.version}:terminates-at-current`,
            passed: terminal?.status === "current",
            observed: migrationPath ?? error
          }
    );
    return { ...entry, migrationPath };
  });

  const versions = entries.map((entry) => entry.version);
  for (const unknown of [Math.min(...versions) - 1, Math.max(...versions) + 1]) {
    checks.push({
      id: `${kind}:v${unknown}:unknown-version-rejected`,
      passed: rejects(kind, unknown),
      observed: unknown
    });
  }
}

const failed = checks.filter((check) => !check.passed);
const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  status: failed.length === 0 ? "pass" : "fail",
  boundaries,
  checks,
  notMeasuredHere: [
    "Canonical meaning preservation across scenario migrations is covered by the schema-unit Vitest project, not by this report."
  ]
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Compatibility report generated: ${checks.length - failed.length}/${checks.length} checks passed.`
);
if (failed.length > 0) {
  console.error(`Failed checks: ${failed.map((check) => check.id).join(", ")}`);
  process.exitCode = 1;
}
