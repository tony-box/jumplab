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

// Keep in sync with README.md and .github/workflows/verify.yml.
const WASM_PACK_VERSION = "0.15.0";

const ensureWasmPack = () => {
  const result = spawnSync("wasm-pack", ["--version"], {
    encoding: "utf8",
    shell: globalThis.process.platform === "win32"
  });
  const install = `cargo install wasm-pack --version ${WASM_PACK_VERSION} --locked`;

  if (result.status !== 0) {
    throw new Error(`wasm-pack is required. Install it with: ${install}`);
  }
  const found = result.stdout.match(/\d+\.\d+\.\d+/)?.[0];
  // The generated JS bindings vary between wasm-pack minors, so only patch updates are accepted.
  if (
    found?.split(".").slice(0, 2).join(".") !== WASM_PACK_VERSION.split(".").slice(0, 2).join(".")
  ) {
    throw new Error(
      `wasm-pack ${WASM_PACK_VERSION} is required, found ${found ?? "unknown"}. Install it with: ${install}`
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

  globalThis.console.log("Physics native and WASM builds completed.");
};

main();
