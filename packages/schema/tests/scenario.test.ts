import { describe, expect, it } from "vitest";

import {
  canonicalizeScenarioJson,
  DEFAULT_RIDER_COUPLING,
  DEFAULT_RIDER_INSTINCT,
  hashScenario,
  kickerTransitionLength,
  lipAngleRange,
  migrateScenarioValue,
  normalizeJump,
  normalizeLipAngle,
  parseScenario,
  parseScenarioFile,
  scenarioFileSchema,
  SOLVER_VERSION,
  type Scenario,
  type ScenarioFile
} from "../src/index";

const baseScenario: Scenario = {
  schemaVersion: 4,
  id: "2fbb1b9d-c304-48ef-b42d-f7c3418a8f30",
  name: "Standard Jump",
  jump: {
    kind: "table",
    lipHeight: 1.2,
    lipAngle: 0.82,
    transitionLength: kickerTransitionLength(1.2, 0.82),
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
    coupling: { ...DEFAULT_RIDER_COUPLING },
    joints: {
      knee: { min: -1.7, max: 0.1 },
      hip: { min: -1.2, max: 1.1 },
      spine: { min: -0.6, max: 0.6 },
      shoulder: { min: -1.4, max: 1.4 },
      elbow: { min: -1.4, max: 0.2 }
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
    outputHz: 240,
    solverVersion: SOLVER_VERSION,
    riderInstinct: { ...DEFAULT_RIDER_INSTINCT }
  }
};

type Mutable = Record<string, unknown>;

/** Rebuilds the base scenario in the schema 3 shape: actuator gains, joint torques, and a seed. */
const toV3 = (
  scenario: Scenario,
  overrides: { jump?: Mutable; solver?: Mutable } = {}
): Record<string, unknown> => {
  const { coupling: _coupling, joints, ...rider } = scenario.rider;
  const { riderInstinct: _instinct, ...solver } = scenario.solver;
  return {
    ...structuredClone(scenario),
    schemaVersion: 3,
    jump: { ...scenario.jump, transitionLength: 1.68, ...overrides.jump },
    rider: {
      ...rider,
      kp: 1500,
      kd: 120,
      joints: Object.fromEntries(
        Object.entries(joints).map(([name, limit]) => [name, { ...limit, tauMax: 500 }])
      )
    },
    solver: {
      ...solver,
      seed: 7,
      solverVersion: "rapier-0.35.2-two-wheel-contact-v5-geometry-v1-mass-distribution-v1",
      ...overrides.solver
    }
  };
};

const physicsHz = (solver: { dt: number; substeps: number }): number =>
  Math.round(solver.substeps / solver.dt);

describe("scenario schema", () => {
  it("requires kicker transitions to be the circular arc implied by height and lip angle", () => {
    const jump = baseScenario.jump;
    expect(jump.transitionLength).toBeCloseTo(1.2 / Math.tan(0.41), 12);
    expect(() => parseScenario(baseScenario)).not.toThrow();

    expect(() =>
      parseScenario({ ...baseScenario, jump: { ...jump, transitionLength: 1.7 } })
    ).toThrow(/transitionLength must equal the derived arc length/);
    expect(() =>
      parseScenario({
        ...baseScenario,
        jump: { ...jump, transitionLength: jump.transitionLength + 0.0005 }
      })
    ).not.toThrow();

    expect(() =>
      parseScenario({
        ...baseScenario,
        jump: { ...jump, lipAngle: 0.04, transitionLength: kickerTransitionLength(1.2, 0.04) }
      })
    ).toThrow(/kicker lipAngle must be at least 0.05/);
    expect(() =>
      parseScenario({ ...baseScenario, jump: { ...jump, lipAngle: 0.06, transitionLength: 30 } })
    ).toThrow(/transition, outside 0.5-30 m/);
    expect(() =>
      parseScenario({
        ...baseScenario,
        jump: { ...jump, lipHeight: 0.2, lipAngle: 1.2, transitionLength: 0.5 }
      })
    ).toThrow(/transition, outside 0.5-30 m/);
  });

  it("accepts steep kickers that the retired lip rollover rule used to reject", () => {
    const lipAngle = 0.48;
    const parsed = parseScenario({
      ...baseScenario,
      jump: {
        ...baseScenario.jump,
        lipAngle,
        transitionLength: kickerTransitionLength(1.2, lipAngle)
      }
    });
    expect(parsed.jump.lipAngle).toBe(lipAngle);
    expect(parsed.jump.transitionLength).toBeCloseTo(1.2 / Math.tan(lipAngle / 2), 12);
  });

  it("normalizes lip angles into the range that keeps the arc length supported", () => {
    expect(lipAngleRange({ kind: "table", lipHeight: 4 })).toEqual({
      minimum: 2 * Math.atan(4 / 30),
      maximum: 1.5
    });
    expect(lipAngleRange({ kind: "gap", lipHeight: 0.2 })).toEqual({
      minimum: 0.05,
      maximum: 2 * Math.atan(0.2 / 0.5)
    });
    expect(lipAngleRange({ kind: "drop", lipHeight: 1 })).toEqual({
      minimum: -0.35,
      maximum: 0.35
    });

    const shallowTall = { ...baseScenario.jump, lipHeight: 4, lipAngle: 0.05 };
    const steepShort = { ...baseScenario.jump, lipHeight: 0.2, lipAngle: 1.5 };
    expect(normalizeLipAngle(shallowTall)).toBeCloseTo(0.27, 12);
    expect(normalizeLipAngle(steepShort)).toBeCloseTo(0.76, 12);
    expect(normalizeLipAngle({ ...baseScenario.jump, lipHeight: 4, lipAngle: 1.5 })).toBe(1.5);

    for (const jump of [shallowTall, steepShort, { ...baseScenario.jump, lipAngle: 0.3 }]) {
      const normalized = normalizeJump(jump);
      expect(normalized.transitionLength).toBeCloseTo(
        kickerTransitionLength(normalized.lipHeight, normalized.lipAngle),
        12
      );
      expect(normalized.transitionLength).toBeGreaterThanOrEqual(0.5);
      expect(normalized.transitionLength).toBeLessThanOrEqual(30);
      expect(() => parseScenario({ ...baseScenario, jump: normalized })).not.toThrow();
    }

    const drop = { ...baseScenario.jump, kind: "drop", stepDelta: -1, transitionLength: 2.5 };
    expect(normalizeJump(drop)).toBe(drop);
  });

  it("lets drops roll off a level or falling edge with an authored transition", () => {
    const dropJump = {
      ...baseScenario.jump,
      kind: "drop",
      stepDelta: -1.5,
      transitionLength: 1.7
    };

    const level = parseScenario({ ...baseScenario, jump: { ...dropJump, lipAngle: 0 } });
    expect(level.jump.lipAngle).toBe(0);
    expect(level.jump.transitionLength).toBe(1.7);
    expect(
      parseScenario({ ...baseScenario, jump: { ...dropJump, lipAngle: -0.2 } }).jump.lipAngle
    ).toBe(-0.2);
    expect(
      parseScenario({ ...baseScenario, jump: { ...dropJump, lipAngle: 0.35 } }).jump.lipAngle
    ).toBe(0.35);
    expect(() => parseScenario({ ...baseScenario, jump: { ...dropJump, lipAngle: 0.6 } })).toThrow(
      /drop lipAngle must be between -0.35 and 0.35 rad/
    );
    expect(() =>
      parseScenario({ ...baseScenario, jump: { ...dropJump, lipAngle: -0.4 } })
    ).toThrow();
    expect(() =>
      parseScenario({ ...baseScenario, jump: { ...dropJump, lipAngle: 0, stepDelta: 0.5 } })
    ).toThrow(/drop jumps require a negative stepDelta/);
  });

  it("migrates a legacy transition radius through every schema to a v4 arc kicker", () => {
    const legacy = toV3(baseScenario);
    legacy.schemaVersion = 1;
    delete (legacy.bike as Mutable).geometry;
    const jump = legacy.jump as Mutable;
    delete jump.transitionLength;
    jump.transitionRadius = 3.5;

    const migrated = parseScenario(legacy);

    expect(migrated.schemaVersion).toBe(4);
    expect("transitionRadius" in migrated.jump).toBe(false);
    expect(migrated.jump.lipHeight).toBe(baseScenario.jump.lipHeight);
    expect(migrated.jump.transitionLength).toBeCloseTo(
      kickerTransitionLength(migrated.jump.lipHeight, migrated.jump.lipAngle),
      9
    );
    expect(migrated.bike.geometry.modelVersion).toBe(1);
    expect(migrated.rider.coupling).toEqual(DEFAULT_RIDER_COUPLING);
  });

  it("migrates a v3 scenario to v4 arc kickers, rider coupling, and a 240 Hz minimum", () => {
    const legacy = toV3(baseScenario, {
      solver: { dt: 0.008333333333333333, substeps: 1, outputHz: 120 }
    });
    expect(physicsHz(legacy.solver as { dt: number; substeps: number })).toBe(120);

    const migrated = migrateScenarioValue(legacy) as Scenario & Record<string, unknown>;

    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.jump.lipAngle).toBeCloseTo(0.82, 12);
    expect(migrated.jump.transitionLength).toBeCloseTo(kickerTransitionLength(1.2, 0.82), 9);
    expect(migrated.jump.transitionLength).not.toBeCloseTo(1.68, 3);

    expect(migrated.rider).not.toHaveProperty("kp");
    expect(migrated.rider).not.toHaveProperty("kd");
    expect(migrated.rider.coupling).toEqual(DEFAULT_RIDER_COUPLING);
    expect(migrated.rider.joints).toEqual(baseScenario.rider.joints);
    for (const limit of Object.values(migrated.rider.joints)) {
      expect(limit).not.toHaveProperty("tauMax");
    }

    expect(migrated.solver).not.toHaveProperty("seed");
    expect(migrated.solver.riderInstinct).toEqual(DEFAULT_RIDER_INSTINCT);
    expect(migrated.solver.solverVersion).toBe(SOLVER_VERSION);
    expect(migrated.solver.dt).toBe(0.008333333333333333);
    expect(migrated.solver.substeps).toBe(2);
    expect(physicsHz(migrated.solver)).toBe(240);
    expect(migrated.solver.outputHz).toBe(120);

    expect(migrated.id).toBe(baseScenario.id);
    expect(migrated.bike).toEqual(baseScenario.bike);
    expect(migrated.entry).toEqual(baseScenario.entry);
    expect(migrated.poseClip).toEqual(baseScenario.poseClip);
    expect(parseScenario(legacy)).toEqual(parseScenario(migrated));
  });

  it("keeps fast v3 solvers and drop transitions while clamping out-of-range kicker arcs", () => {
    const fast = migrateScenarioValue(toV3(baseScenario)) as Scenario;
    expect(fast.solver.substeps).toBe(4);
    expect(physicsHz(fast.solver)).toBe(3840);

    const slow = migrateScenarioValue(
      toV3(baseScenario, { solver: { dt: 0.016666666666666666, substeps: 1, outputHz: 60 } })
    ) as Scenario;
    expect(slow.solver.substeps).toBe(4);
    expect(() => parseScenario(slow)).not.toThrow();

    const drop = migrateScenarioValue(
      toV3(baseScenario, {
        jump: { kind: "drop", lipAngle: -0.1, stepDelta: -1, transitionLength: 2.5 }
      })
    ) as Scenario;
    expect(drop.jump.lipAngle).toBe(-0.1);
    expect(drop.jump.transitionLength).toBe(2.5);
    expect(() => parseScenario(drop)).not.toThrow();

    const tooLong = migrateScenarioValue(toV3(baseScenario, { jump: { lipAngle: 0.05 } }));
    const longJump = (tooLong as Scenario).jump;
    expect(longJump.transitionLength).toBe(30);
    expect(longJump.lipAngle).toBeCloseTo(2 * Math.atan(1.2 / 30), 12);
    expect(() => parseScenario(tooLong)).not.toThrow();

    const tooShort = migrateScenarioValue(
      toV3(baseScenario, { jump: { lipHeight: 0.2, lipAngle: 1.2 } })
    );
    const shortJump = (tooShort as Scenario).jump;
    expect(shortJump.transitionLength).toBe(0.5);
    expect(shortJump.lipAngle).toBeCloseTo(2 * Math.atan(0.2 / 0.5), 12);
    expect(() => parseScenario(tooShort)).not.toThrow();
  });

  it("throws instead of recursing when a v1 scenario has no transitionRadius", () => {
    const legacy = toV3(baseScenario);
    legacy.schemaVersion = 1;
    delete (legacy.jump as Mutable).transitionLength;

    expect(() => migrateScenarioValue(legacy)).toThrow("Cannot migrate scenario schemaVersion 1");
    expect(() => parseScenario(legacy)).toThrow("Cannot migrate scenario schemaVersion 1");
    expect(() => migrateScenarioValue({ ...legacy, schemaVersion: 0 })).toThrow(
      "Unsupported scenario schemaVersion: 0"
    );
    expect(() => migrateScenarioValue({ ...legacy, schemaVersion: 5 })).toThrow(
      "Unsupported scenario schemaVersion: 5"
    );
    expect(() => migrateScenarioValue({ ...legacy, schemaVersion: "3" })).toThrow(
      "Unsupported scenario schemaVersion: 3"
    );
  });

  it("accepts a valid scenario and scenario file", async () => {
    const scenario = parseScenario(baseScenario);
    const hash = await hashScenario(scenario);

    const file: ScenarioFile = {
      format: "bike-jumper-scenario",
      schemaVersion: 4,
      exportedBy: {
        appVersion: "0.1.0",
        solverVersion: scenario.solver.solverVersion,
        exportedAt: "2026-08-24T12:00:00.000Z"
      },
      scenario,
      contentHash: hash
    };

    expect(() => scenarioFileSchema.parse(file)).not.toThrow();
    expect(() => scenarioFileSchema.parse({ ...file, schemaVersion: 3 })).toThrow();
    await expect(parseScenarioFile(file)).resolves.toMatchObject({
      contentHash: hash,
      scenario: { id: scenario.id }
    });
  });

  it("migrates and rehashes a v3 scenario file", async () => {
    const legacy = toV3(baseScenario);
    const legacyHash = await hashScenario(legacy);
    const parsed = await parseScenarioFile({
      format: "bike-jumper-scenario",
      schemaVersion: 3,
      exportedBy: {
        appVersion: "0.1.0",
        solverVersion: "rapier-0.35.2-two-wheel-contact-v5-geometry-v1-mass-distribution-v1",
        exportedAt: "2026-08-24T12:00:00.000Z"
      },
      scenario: legacy,
      contentHash: legacyHash
    });

    expect(parsed.schemaVersion).toBe(4);
    expect(parsed.scenario.schemaVersion).toBe(4);
    expect(parsed.scenario.rider.coupling).toEqual(DEFAULT_RIDER_COUPLING);
    expect(parsed.contentHash).toBe(await hashScenario(parsed.scenario));
    expect(parsed.contentHash).not.toBe(legacyHash);
  });

  it("rejects invalid cross-field combinations and retired fields", () => {
    const badJoint = {
      ...baseScenario,
      rider: {
        ...baseScenario.rider,
        joints: {
          ...baseScenario.rider.joints,
          knee: { min: 0.2, max: -0.1 }
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
        substeps: 2,
        outputHz: 960
      }
    };

    const slowPhysics = {
      ...baseScenario,
      solver: {
        ...baseScenario.solver,
        dt: 0.008333333333333333,
        substeps: 1,
        outputHz: 120
      }
    };

    expect(() => parseScenario(badJoint)).toThrow(/joint min must be less than or equal to max/);
    expect(() => parseScenario(badPoseKeys)).toThrow(/strictly increasing s order/);
    expect(() => parseScenario(badSolver)).toThrow(/outputHz must divide/);
    expect(() => parseScenario(slowPhysics)).toThrow(/must be at least 240 Hz/);
    expect(() =>
      parseScenario({
        ...slowPhysics,
        solver: { ...slowPhysics.solver, substeps: 2 }
      })
    ).not.toThrow();

    expect(() =>
      parseScenario({ ...baseScenario, rider: { ...baseScenario.rider, kp: 1500 } })
    ).toThrow();
    expect(() =>
      parseScenario({
        ...baseScenario,
        rider: {
          ...baseScenario.rider,
          joints: { ...baseScenario.rider.joints, knee: { min: -1.7, max: 0.1, tauMax: 700 } }
        }
      })
    ).toThrow();
    expect(() =>
      parseScenario({ ...baseScenario, solver: { ...baseScenario.solver, seed: 0 } })
    ).toThrow();
    const { coupling: _coupling, ...riderWithoutCoupling } = baseScenario.rider;
    expect(() => parseScenario({ ...baseScenario, rider: riderWithoutCoupling })).toThrow();
    const { riderInstinct: _instinct, ...solverWithoutInstinct } = baseScenario.solver;
    expect(() => parseScenario({ ...baseScenario, solver: solverWithoutInstinct })).toThrow();
    expect(() =>
      parseScenario({
        ...baseScenario,
        rider: {
          ...baseScenario.rider,
          coupling: { ...baseScenario.rider.coupling, linearFrequency: 100 }
        }
      })
    ).toThrow();
    expect(() =>
      parseScenario({
        ...baseScenario,
        solver: {
          ...baseScenario.solver,
          riderInstinct: { ...baseScenario.solver.riderInstinct, maxAngle: 0.6 }
        }
      })
    ).toThrow();
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
      schemaVersion: 4,
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
