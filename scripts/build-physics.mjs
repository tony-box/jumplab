import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");

const crateDir = resolve(rootDir, "crates", "physics-core");

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

const ensureWasmPack = () => {
  const result = spawnSync("wasm-pack", ["--version"], {
    stdio: "ignore",
    shell: globalThis.process.platform === "win32"
  });

  if (result.status !== 0) {
    throw new Error("wasm-pack is required. Install it with: cargo install wasm-pack --locked");
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

  globalThis.console.log("Physics native and WASM builds completed.");
};

main();
