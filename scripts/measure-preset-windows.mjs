// Measures the entry-speed window of every jump preset with the real core and stores it in the
// preset catalog, so the Library doesn't run a solve sweep per preset on every visit.
// Re-run after any change to the physics or the presets: `node scripts/measure-preset-windows.mjs`.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const wasm = require(resolve(rootDir, "crates/physics-core/pkg-node/physics_core.js"));

const catalogPath = resolve(rootDir, "tests/fixtures/presets/catalog-v1.json");
const base = JSON.parse(
  readFileSync(resolve(rootDir, "tests/fixtures/scenarios/standard-v1.json"), "utf8")
);
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));

const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const mergeDeep = (target, patch) => {
  if (!isRecord(patch)) return globalThis.structuredClone(patch);
  const result = isRecord(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) result[key] = mergeDeep(result[key], value);
  return result;
};

for (const preset of catalog) {
  if (preset.category !== "jump") continue;
  const scenario = mergeDeep(base, { jump: preset.patch.jump, entry: preset.patch.entry });
  const started = performance.now();
  const window = JSON.parse(wasm.analyzeSpeedWindowJson(JSON.stringify(scenario)));
  preset.speedWindow = {
    minimum: window.minimum,
    maximum: window.maximum,
    status: window.status,
    reason: window.reason ?? null
  };
  process.stdout.write(
    `${preset.id}: ${window.status} ${window.minimum.toFixed(2)}-${window.maximum.toFixed(2)} m/s (${Math.round(performance.now() - started)} ms)\n`
  );
}

writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
