import { describe, expect, it } from "vitest";

import {
  canonicalizeScenarioJson,
  hashScenario,
  normalizeLipAngle,
  parseScenario,
  parseScenarioFile,
  scenarioFileSchema,
  type Scenario,
  type ScenarioFile
} from "../src/index";

const baseScenario: Scenario = {
  schemaVersion: 3,
  id: "2fbb1b9d-c304-48ef-b42d-f7c3418a8f30",
  name: "Standard Jump",
  jump: {
    kind: "table",
    lipHeight: 1.2,
    lipAngle: 0.82,
    transitionLength: 1.68,
    gap: 6,
    stepDelta: 0,
    landingAngle: 0.35,
    landingLength: 9,
    rollout: 12
  },
  rider: {
    height: 1.78,
    mass: 75,
    legRatio: 0.48,
    armRatio: 0.38,
    strengthScale: 1,
    kp: 1500,
    kd: 120,
    joints: {
      knee: { min: -1.7, max: 0.1, tauMax: 700 },
      hip: { min: -1.2, max: 1.1, tauMax: 800 },
      spine: { min: -0.6, max: 0.6, tauMax: 500 },
      shoulder: { min: -1.4, max: 1.4, tauMax: 350 },
      elbow: { min: -1.4, max: 0.2, tauMax: 300 }
    }
  },
  bike: {
    frameType: "hardtail",
    wheelSize: 29,
    wheelbase: 1.25,
    chainstay: 0.44,
    bbHeight: 0.33,
    mass: 14,
    fork: {
      travel: 0.15,
      sag: 0.035,
      springRate: 21000,
      damping: 1450
    },
    rearShock: null,
    geometry: {
      modelVersion: 1,
      reach: 0.47,
      stack: 0.63,
      headTubeLength: 0.11,
      headTubeAngle: 1.1344640137963142,
      forkLength: 0.5706583371144672,
      forkOffset: 0.05,
      seatTubeLength: 0.322,
      seatTubeAngle: 1.3264502315156903,
      saddleHeight: 0.46,
      saddleSetback: 0,
      crankLength: 0.17,
      handlebarOffsetX: 0.05,
      handlebarOffsetY: 0.03
    }
  },
  entry: {
    speed: 7.2,
    startX: -8
  },
  poseClip: {
    id: "8f5ae67b-86cd-4111-af3a-7d2a758d6d16",
    name: "Neutral preload",
    interpolation: "cubic",
    keys: [
      {
        s: -6,
        label: "Approach",
        targets: { knee: 0.95, hip: 0.45, spine: 0.12 }
      },
      {
        s: 0,
        label: "Lip",
        targets: { knee: 1.02, hip: 0.5, spine: 0.18 }
      },
      {
        s: 4,
        label: "Flight",
        targets: { knee: 0.72, hip: 0.32, spine: 0.05 }
      }
    ]
  },
  solver: {
    dt: 0.0010416666666666667,
    substeps: 4,
    ccd: true,
    seed: 0,
    outputHz: 240,
    solverVersion: "rapier-0.35.2-enhanced-determinism"
  }
};

describe("scenario schema", () => {
  it("rejects a lip angle that would make the takeoff roll over", () => {
    expect(() =>
      parseScenario({
        ...baseScenario,
        jump: { ...baseScenario.jump, lipHeight: 1.2, transitionLength: 1.7, lipAngle: 0.48 }
      })
    ).toThrow(/lipAngle must be at least/);
  });

  it("normalizes the steepest supported takeoff without exceeding the angle range", () => {
    const steep = {
      ...baseScenario.jump,
      lipHeight: 4,
      transitionLength: 0.5,
      lipAngle: 0.8
    };

    const normalized = normalizeLipAngle(steep);
    expect(normalized).toBeLessThanOrEqual(1.5);
    expect(() =>
      parseScenario({ ...baseScenario, jump: { ...steep, lipAngle: normalized } })
    ).not.toThrow();
  });

  it("lets drops roll off a level or falling edge while still bounding the kick", () => {
    const dropJump = { ...baseScenario.jump, kind: "drop", stepDelta: -1.5 };

    expect(
      parseScenario({ ...baseScenario, jump: { ...dropJump, lipAngle: 0 } }).jump.lipAngle
    ).toBe(0);
    expect(
      parseScenario({ ...baseScenario, jump: { ...dropJump, lipAngle: -0.2 } }).jump.lipAngle
    ).toBe(-0.2);
    expect(() => parseScenario({ ...baseScenario, jump: { ...dropJump, lipAngle: 0.6 } })).toThrow(
      /lipAngle must be at most/
    );
    expect(() =>
      parseScenario({ ...baseScenario, jump: { ...dropJump, lipAngle: 0, stepDelta: 0.5 } })
    ).toThrow(/drop jumps require a negative stepDelta/);
  });

  it("migrates a legacy transition radius without moving the lip", () => {
    const legacy = structuredClone(baseScenario) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 1;
    delete (legacy.bike as Record<string, unknown>).geometry;
    const jump = legacy.jump as Record<string, unknown>;
    delete jump.transitionLength;
    jump.transitionRadius = 3.5;

    const migrated = parseScenario(legacy);

    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.jump.transitionLength).toBeCloseTo(3.5 * migrated.jump.lipAngle);
    expect("transitionRadius" in migrated.jump).toBe(false);
  });

  it("accepts a valid scenario and scenario file", async () => {
    const scenario = parseScenario(baseScenario);
    const hash = await hashScenario(scenario);

    const file: ScenarioFile = {
      format: "bike-jumper-scenario",
      schemaVersion: 3,
      exportedBy: {
        appVersion: "0.1.0",
        solverVersion: scenario.solver.solverVersion,
        exportedAt: "2026-08-24T12:00:00.000Z"
      },
      scenario,
      contentHash: hash
    };

    expect(() => scenarioFileSchema.parse(file)).not.toThrow();
    await expect(parseScenarioFile(file)).resolves.toMatchObject({
      contentHash: hash,
      scenario: { id: scenario.id }
    });
  });

  it("rejects invalid cross-field combinations", () => {
    const badJoint = {
      ...baseScenario,
      rider: {
        ...baseScenario.rider,
        joints: {
          ...baseScenario.rider.joints,
          knee: { min: 0.2, max: -0.1, tauMax: 600 }
        }
      }
    };

    const badPoseKeys = {
      ...baseScenario,
      poseClip: {
        ...baseScenario.poseClip,
        keys: [
          baseScenario.poseClip.keys[1],
          baseScenario.poseClip.keys[0],
          baseScenario.poseClip.keys[1]
        ]
      }
    };

    const badSolver = {
      ...baseScenario,
      solver: {
        ...baseScenario.solver,
        dt: 0.008333333333333333,
        substeps: 1,
        outputHz: 240
      }
    };

    expect(() => parseScenario(badJoint)).toThrow();
    expect(() => parseScenario(badPoseKeys)).toThrow();
    expect(() => parseScenario(badSolver)).toThrow();
  });

  it("canonicalizes equal semantic scenarios to identical JSON and hash", async () => {
    const reordered = {
      ...baseScenario,
      jump: {
        landingLength: baseScenario.jump.landingLength,
        rollout: baseScenario.jump.rollout,
        lipHeight: baseScenario.jump.lipHeight,
        kind: baseScenario.jump.kind,
        stepDelta: baseScenario.jump.stepDelta,
        transitionLength: baseScenario.jump.transitionLength,
        lipAngle: baseScenario.jump.lipAngle,
        gap: baseScenario.jump.gap,
        landingAngle: baseScenario.jump.landingAngle
      }
    } as Scenario;

    const canonicalA = canonicalizeScenarioJson(baseScenario);
    const canonicalB = canonicalizeScenarioJson(reordered);

    expect(canonicalA).toEqual(canonicalB);
    await expect(hashScenario(baseScenario)).resolves.toEqual(await hashScenario(reordered));
  });

  it("rejects malformed inputs and hash mismatches", async () => {
    const hash = await hashScenario(baseScenario);
    const malformed = {
      format: "bike-jumper-scenario",
      schemaVersion: 1,
      exportedBy: {
        appVersion: "0.1.0",
        solverVersion: "x",
        exportedAt: "not-an-iso-date"
      },
      scenario: baseScenario,
      contentHash: hash
    };

    const mismatch = {
      ...malformed,
      exportedBy: {
        appVersion: "0.1.0",
        solverVersion: "x",
        exportedAt: "2026-08-24T12:00:00.000Z"
      },
      contentHash: "f".repeat(64)
    };

    expect(() => scenarioFileSchema.parse(malformed)).toThrow();
    await expect(parseScenarioFile(mismatch)).rejects.toThrow(/content hash/i);
  });
});
