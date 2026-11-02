import { describe, expect, it } from "vitest";

import {
  assertCompatibleVersion,
  canonicalJsonStringify,
  FRAME_LAYOUT_VERSION,
  migrateScenarioFile,
  PROTOCOL_VERSION,
  resolveMigrationPath
} from "../../packages/schema/src/index";
import { versionManifest } from "../../apps/web/src/app/version-manifest";

describe("compatibility registries", () => {
  it("accepts every current boundary version and rejects unknown versions", () => {
    expect(assertCompatibleVersion("scenario", 1).status).toBe("migratable");
    expect(assertCompatibleVersion("scenario", 2).status).toBe("migratable");
    expect(assertCompatibleVersion("scenario", 3).status).toBe("current");
    expect(resolveMigrationPath("scenario", 1)).toEqual([1, 2, 3]);
    expect(resolveMigrationPath("scenario", 2)).toEqual([2, 3]);

    expect(assertCompatibleVersion("protocol", 1).status).toBe("migratable");
    expect(assertCompatibleVersion("protocol", 3).status).toBe("current");
    expect(resolveMigrationPath("protocol", 1)).toEqual([1, 2, 3]);

    expect(assertCompatibleVersion("frame-layout", 2).status).toBe("current");
    expect(() => assertCompatibleVersion("frame-layout", 3)).toThrow(
      "Unsupported frame-layout version"
    );

    expect(versionManifest).toMatchObject({
      schema: 3,
      protocol: PROTOCOL_VERSION,
      frameLayout: FRAME_LAYOUT_VERSION,
      model: "rigid-two-wheel-contact-v4-geometry-v1-mass-distribution-v1",
      solver: "rapier-0.35.2-two-wheel-contact-v5-geometry-v1-mass-distribution-v1"
    });

    for (const kind of ["frame-layout", "persistence"] as const) {
      expect(assertCompatibleVersion(kind, 1).status).toBe("migratable");
      expect(assertCompatibleVersion(kind, 2).status).toBe("current");
      expect(resolveMigrationPath(kind, 1)).toEqual([1, 2]);
      expect(resolveMigrationPath(kind, 2)).toEqual([2]);
      expect(() => assertCompatibleVersion(kind, 3)).toThrow(`Unsupported ${kind} version`);
    }
  });

  it("migrates the legacy radius to an equivalent horizontal transition length", () => {
    const input = {
      format: "bike-jumper-scenario",
      schemaVersion: 1,
      scenario: {
        schemaVersion: 1,
        jump: { lipAngle: 0.4, transitionRadius: 3 }
      }
    };
    expect(canonicalJsonStringify(migrateScenarioFile(input))).toBe(
      canonicalJsonStringify({
        format: "bike-jumper-scenario",
        schemaVersion: 3,
        scenario: {
          schemaVersion: 2,
          jump: { lipAngle: 0.4, transitionLength: 1.2000000000000002 }
        }
      })
    );
  });
});
