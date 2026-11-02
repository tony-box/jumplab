import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");

const crateDir = resolve(rootDir, "crates", "physics-core");
const pkgDir = resolve(crateDir, "pkg");
const webPhysicsDir = resolve(rootDir, "apps", "web", "public", "physics");

const run = (command, args, cwd = rootDir) => {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: globalThis.process.platform === "win32"
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
};

const runCapture = (command, args, cwd = rootDir) => {
  const result = spawnSync(command, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    shell: globalThis.process.platform === "win32"
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    throw new Error(stderr ? `${command} failed: ${stderr}` : `${command} failed`);
  }

  return (result.stdout ?? "").trim();
};

const ensureWasmPack = () => {
  const result = spawnSync("wasm-pack", ["--version"], {
    stdio: "ignore",
    shell: globalThis.process.platform === "win32"
  });

  if (result.status !== 0) {
    throw new Error("wasm-pack is required. Install it with: cargo install wasm-pack --locked");
  }
};

const copyArtifacts = () => {
  const artifacts = [
    "physics_core.js",
    "physics_core_bg.wasm",
    "physics_core.d.ts",
    "package.json"
  ];

  mkdirSync(webPhysicsDir, { recursive: true });

  for (const artifact of artifacts) {
    const sourcePath = resolve(pkgDir, artifact);
    if (!existsSync(sourcePath)) {
      throw new Error(`Missing generated artifact: ${sourcePath}`);
    }
    copyFileSync(sourcePath, resolve(webPhysicsDir, artifact));
  }
};

const checkGeneratedDrift = () => {
  const repositoryProbe = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: rootDir,
    stdio: "ignore",
    shell: globalThis.process.platform === "win32"
  });

  if (repositoryProbe.status !== 0) {
    globalThis.console.warn("Skipping generated physics drift check outside a Git repository.");
    return;
  }

  const output = runCapture("git", ["status", "--porcelain", "--", "crates/physics-core/pkg"]);
  if (output.length > 0) {
    throw new Error(
      "Generated physics bindings are out of date. Re-run npm run build:physics and commit crates/physics-core/pkg changes."
    );
  }
};

const main = () => {
  run("cargo", ["check", "-p", "physics-core"]);
  run("cargo", ["check", "-p", "physics-core", "--target", "wasm32-unknown-unknown"]);

  ensureWasmPack();
  run("wasm-pack", [
    "build",
    crateDir,
    "--target",
    "web",
    "--out-dir",
    "pkg",
    "--out-name",
    "physics_core"
  ]);
  run("wasm-pack", [
    "build",
    crateDir,
    "--target",
    "nodejs",
    "--out-dir",
    "pkg-node",
    "--out-name",
    "physics_core"
  ]);

  copyArtifacts();

  if (globalThis.process.env.SKIP_PHYSICS_DRIFT_CHECK !== "1") {
    checkGeneratedDrift();
  }

  globalThis.console.log("Physics native/WASM checks and artifact sync completed.");
};

main();
