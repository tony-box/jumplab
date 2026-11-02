import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertCompatibleVersion,
  FRAME_LAYOUT_VERSION,
  kickerTransitionLength,
  migrateScenarioFile,
  migrateScenarioValue,
  MODEL_VERSION,
  parseScenario,
  PROTOCOL_VERSION,
  resolveMigrationPath,
  SCENARIO_SCHEMA_VERSION,
  SOLVER_VERSION
} from "../../packages/schema/src/index";
import { versionManifest } from "../../apps/web/src/app/version-manifest";

const readJson = (...segments: string[]): Record<string, unknown> =>
  JSON.parse(readFileSync(resolve("tests", "fixtures", ...segments), "utf8"));

const v2Input = readJson("scenarios", "geometry-v2", "standard-v2.input.json");
const expected = readJson("scenarios", "geometry-v2", "standard-v4.expected.json") as {
  sourceSchemaVersion: number;
  targetSchemaVersion: number;
  scenarioId: string;
  geometry: Record<string, number>;
  jump: { lipHeight: number; lipAngle: number; transitionLength: number };
  riderCoupling: Record<string, number>;
  riderInstinct: Record<string, unknown>;
  minimumPhysicsHz: number;
  removedPaths: string[];
  preservedPaths: string[];
};
const standardScenario = readJson("scenarios", "standard-v1.json");

const valueAt = (value: unknown, path: string): unknown =>
  path
    .split(".")
    .reduce<unknown>(
      (current, key) =>
        current && typeof current === "object"
          ? (current as Record<string, unknown>)[key]
          : undefined,
      value
    );

const hasPath = (value: unknown, path: string): boolean => {
  const keys = path.split(".");
  const last = keys.pop() as string;
  const parent = keys.length === 0 ? value : valueAt(value, keys.join("."));
  return Boolean(parent && typeof parent === "object" && last in parent);
};

describe("compatibility registries", () => {
  it("accepts every current boundary version and rejects unknown versions", () => {
    expect(SCENARIO_SCHEMA_VERSION).toBe(4);
    expect(assertCompatibleVersion("scenario", 1).status).toBe("migratable");
    expect(assertCompatibleVersion("scenario", 2).status).toBe("migratable");
    expect(assertCompatibleVersion("scenario", 3).status).toBe("migratable");
    expect(assertCompatibleVersion("scenario", 4).status).toBe("current");
    expect(resolveMigrationPath("scenario", 1)).toEqual([1, 2, 3, 4]);
    expect(resolveMigrationPath("scenario", 2)).toEqual([2, 3, 4]);
    expect(resolveMigrationPath("scenario", 3)).toEqual([3, 4]);
    expect(resolveMigrationPath("scenario", 4)).toEqual([4]);
    expect(() => assertCompatibleVersion("scenario", 5)).toThrow("Unsupported scenario version");

    expect(PROTOCOL_VERSION).toBe(4);
    expect(assertCompatibleVersion("protocol", 4).status).toBe("current");
    expect(resolveMigrationPath("protocol", 4)).toEqual([4]);
    for (const version of [1, 2, 3, 5]) {
      expect(() => assertCompatibleVersion("protocol", version)).toThrow(
        "Unsupported protocol version"
      );
    }

    expect(FRAME_LAYOUT_VERSION).toBe(3);
    for (const version of [1, 2]) {
      expect(assertCompatibleVersion("frame-layout", version)).toEqual({
        version,
        status: "regenerate",
        migratesTo: null
      });
      expect(resolveMigrationPath("frame-layout", version)).toEqual([version]);
    }
    expect(assertCompatibleVersion("frame-layout", 3).status).toBe("current");
    expect(() => assertCompatibleVersion("frame-layout", 4)).toThrow(
      "Unsupported frame-layout version"
    );

    expect(assertCompatibleVersion("persistence", 1).status).toBe("migratable");
    expect(assertCompatibleVersion("persistence", 2).status).toBe("current");
    expect(resolveMigrationPath("persistence", 1)).toEqual([1, 2]);
    expect(resolveMigrationPath("persistence", 2)).toEqual([2]);
    expect(() => assertCompatibleVersion("persistence", 3)).toThrow(
      "Unsupported persistence version"
    );

    expect(versionManifest).toMatchObject({
      schema: SCENARIO_SCHEMA_VERSION,
      protocol: PROTOCOL_VERSION,
      frameLayout: FRAME_LAYOUT_VERSION,
      persistence: 2,
      model: MODEL_VERSION,
      solver: SOLVER_VERSION
    });
  });

  it("migrates the immutable v2 input through every schema to the current standard scenario", () => {
    expect(expected.sourceSchemaVersion).toBe(v2Input.schemaVersion);
    expect(expected.targetSchemaVersion).toBe(SCENARIO_SCHEMA_VERSION);

    const migratedFile = migrateScenarioFile({
      format: "bike-jumper-scenario",
      schemaVersion: 2,
      scenario: v2Input
    }) as { schemaVersion: number; scenario: Record<string, unknown> };
    const migrated = migratedFile.scenario;

    expect(migratedFile.schemaVersion).toBe(4);
    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.id).toBe(expected.scenarioId);
    expect(valueAt(migrated, "bike.geometry")).toEqual(expected.geometry);

    const jump = migrated.jump as Record<string, number>;
    expect(jump.lipHeight).toBe(expected.jump.lipHeight);
    expect(jump.lipAngle).toBeCloseTo(expected.jump.lipAngle, 12);
    expect(jump.transitionLength).toBeCloseTo(expected.jump.transitionLength, 9);
    expect(jump.transitionLength).toBeCloseTo(
      kickerTransitionLength(jump.lipHeight as number, jump.lipAngle as number),
      9
    );
    expect(valueAt(v2Input, "jump.transitionLength")).not.toBeCloseTo(jump.transitionLength, 3);

    expect(valueAt(migrated, "rider.coupling")).toEqual(expected.riderCoupling);
    expect(valueAt(migrated, "solver.riderInstinct")).toEqual(expected.riderInstinct);
    expect(valueAt(migrated, "solver.solverVersion")).toBe(SOLVER_VERSION);
    const solver = migrated.solver as { dt: number; substeps: number };
    expect(Math.round(solver.substeps / solver.dt)).toBeGreaterThanOrEqual(
      expected.minimumPhysicsHz
    );

    for (const path of expected.removedPaths) {
      expect(hasPath(v2Input, path), `input has ${path}`).toBe(true);
      expect(hasPath(migrated, path), `migrated keeps ${path}`).toBe(false);
    }
    for (const path of expected.preservedPaths) {
      expect(valueAt(migrated, path), path).toEqual(valueAt(v2Input, path));
    }

    expect(parseScenario(migrated)).toEqual(standardScenario);
    expect(migrated).toEqual(standardScenario);
  });

  it("migrates a v1 transition radius file through the full chain", () => {
    const { transitionLength: _length, ...v2Jump } = v2Input.jump as Record<string, unknown>;
    const { geometry: _geometry, ...v1Bike } = v2Input.bike as Record<string, unknown>;
    const v1 = {
      ...v2Input,
      schemaVersion: 1,
      jump: { ...v2Jump, transitionRadius: 3 },
      bike: v1Bike
    };

    const migrated = migrateScenarioFile({
      format: "bike-jumper-scenario",
      schemaVersion: 1,
      scenario: v1
    }) as { schemaVersion: number; scenario: Record<string, unknown> };
    const jump = migrated.scenario.jump as Record<string, number>;

    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.scenario.schemaVersion).toBe(4);
    expect("transitionRadius" in jump).toBe(false);
    expect(jump.lipHeight).toBe(1.2);
    expect(jump.transitionLength).toBeCloseTo(
      kickerTransitionLength(jump.lipHeight as number, jump.lipAngle as number),
      9
    );
    expect(() => parseScenario(migrated.scenario)).not.toThrow();
  });

  it("throws instead of recursing when a migration step cannot advance", () => {
    const stuckV1 = {
      format: "bike-jumper-scenario",
      schemaVersion: 1,
      scenario: { schemaVersion: 1, jump: { lipAngle: 0.4 } }
    };
    expect(() => migrateScenarioFile(stuckV1)).toThrow("Cannot migrate scenario schemaVersion 1");

    const stuckV2 = { schemaVersion: 2, jump: { lipAngle: 0.4, transitionLength: 1.2 } };
    expect(() => migrateScenarioValue(stuckV2)).toThrow("Cannot migrate scenario schemaVersion 2");

    expect(() =>
      migrateScenarioFile({ format: "bike-jumper-scenario", schemaVersion: 5, scenario: {} })
    ).toThrow("Unsupported scenario file schemaVersion: 5");
  });
});
