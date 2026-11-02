import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const digest = (path: string) =>
  createHash("sha256")
    .update(readFileSync(resolve(root, path)))
    .digest("hex");

describe("dependency upgrade gates", () => {
  it("pins declared runtime versions to the lockfiles and manifests", async () => {
    const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
    const { versionManifest } = await import("../../apps/web/src/app/version-manifest");
    expect(lock.packages["apps/web"].dependencies.react).toBe(versionManifest.dependencies.react);
    expect(lock.packages["apps/web"].devDependencies.vite).toBe(versionManifest.dependencies.vite);
    expect(readFileSync(resolve(root, "Cargo.lock"), "utf8")).toContain(`name = "rapier2d"`);
    expect(readFileSync(resolve(root, "Cargo.lock"), "utf8")).toContain(
      `version = "${versionManifest.dependencies.rapier2d}"`
    );
  });

  it("requires nonempty deterministic visual baselines and passing parity evidence", () => {
    const baseline = JSON.parse(
      readFileSync(resolve(root, "tests/fixtures/upgrade-baseline-v1.json"), "utf8")
    );
    for (const [path, expectedHash] of Object.entries(baseline.visuals)) {
      expect(digest(path)).toBe(expectedHash);
    }
    expect(
      JSON.parse(
        readFileSync(resolve(root, "docs/architecture/evidence/physics-spike.json"), "utf8")
      ).status
    ).toBe("pass");
  });
});
