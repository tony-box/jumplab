import { describe, expect, it, vi } from "vitest";

import type {
  EntrySpeedWindowInfo,
  Preset,
  Scenario
} from "../../../../../packages/schema/src/index";
import { createDemoFixtures } from "../../../../tests/fixtures/ui/demo-fixtures";
import { createScenarioCatalog } from "../../src/features/library/scenario-catalog";

const fixtures = createDemoFixtures();

const makePreset = (
  partial: Partial<Preset> & Pick<Preset, "id" | "category" | "name">
): Preset => ({
  id: partial.id,
  category: partial.category,
  name: partial.name,
  tags: partial.tags ?? ["test"],
  note: partial.note ?? "Test preset",
  patch: partial.patch ?? {},
  readOnly: true,
  speedWindow: partial.speedWindow ?? null
});

const measuredWindow: EntrySpeedWindowInfo = {
  minimum: 6.1,
  maximum: 8.4,
  status: "measured",
  reason: null
};

const unavailableWindow: EntrySpeedWindowInfo = {
  minimum: 0,
  maximum: 0,
  status: "unavailable",
  reason: "Awaiting terrain envelope core support"
};

describe("scenario catalog", () => {
  it("validates read-only presets and supports search plus per-category counts", async () => {
    const presets: Preset[] = [
      makePreset({
        id: "jump-reference",
        category: "jump",
        name: "Reference tabletop",
        tags: ["tabletop", "reference"],
        note: "House baseline"
      }),
      makePreset({
        id: "rider-compact",
        category: "rider",
        name: "Compact rider",
        tags: ["compact"],
        note: "Short reach profile"
      }),
      makePreset({
        id: "bike-stable",
        category: "bike",
        name: "Stable wheelbase",
        tags: ["stable"],
        note: "Long wheelbase"
      }),
      makePreset({
        id: "move-late",
        category: "movement",
        name: "Late extension",
        tags: ["timing"],
        note: "Late pop"
      })
    ];

    const analyzeSpeedWindow = vi.fn().mockResolvedValue(measuredWindow);
    const catalog = createScenarioCatalog({
      baseScenario: fixtures.createScenario(),
      presets,
      solverGateway: { analyzeSpeedWindow }
    });

    const jumpMatches = await catalog.search("jump", "reference");
    expect(jumpMatches).toHaveLength(1);
    expect(jumpMatches[0]?.id).toBe("jump-reference");

    const counts = await catalog.count("late");
    expect(counts).toEqual({ jump: 0, rider: 0, bike: 0, movement: 1 });
  });

  it("loads scenarios from immutable presets and does not mutate source records", async () => {
    const presets: Preset[] = [
      makePreset({
        id: "jump-steep",
        category: "jump",
        name: "Steep lip",
        patch: {
          jump: {
            lipAngle: 0.7,
            lipHeight: 1.5
          }
        },
        speedWindow: measuredWindow
      })
    ];

    const catalog = createScenarioCatalog({
      baseScenario: fixtures.createScenario(),
      presets,
      solverGateway: { analyzeSpeedWindow: vi.fn().mockResolvedValue(measuredWindow) }
    });

    const originalPreset = structuredClone(presets[0]);
    const loaded = await catalog.load("jump-steep");
    loaded.jump.lipHeight = 2;

    const loadedAgain = await catalog.load("jump-steep");
    expect(loadedAgain.jump.lipHeight).toBe(1.5);
    expect(presets[0]).toEqual(originalPreset);
  });

  it("patches only the preset category's sections onto a supplied working scenario", async () => {
    const base = fixtures.createScenario();
    const presets: Preset[] = [
      makePreset({
        id: "rider-light",
        category: "rider",
        name: "Light rider",
        patch: { name: "Ignored", rider: { mass: 60 }, jump: { gap: 9 } }
      }),
      makePreset({
        id: "bike-heavy",
        category: "bike",
        name: "Heavy bike",
        patch: { bike: { mass: 18 } }
      }),
      makePreset({
        id: "move-linear",
        category: "movement",
        name: "Linear",
        patch: { poseClip: { interpolation: "linear" }, rider: { mass: 99 } }
      }),
      makePreset({
        id: "jump-big",
        category: "jump",
        name: "Big gap",
        patch: { jump: { gap: 7.5 }, entry: { speed: 9.5 }, rider: { mass: 99 } }
      })
    ];
    const catalog = createScenarioCatalog({
      baseScenario: fixtures.createScenario(),
      presets,
      solverGateway: { analyzeSpeedWindow: vi.fn().mockResolvedValue(measuredWindow) }
    });

    const rider = await catalog.load("rider-light", base);
    expect(rider.id).toBe(base.id);
    expect(rider.name).toBe(base.name);
    expect(rider.rider.mass).toBe(60);
    expect(rider.rider.height).toBe(base.rider.height);
    expect(rider.jump).toEqual(base.jump);
    expect(rider.bike).toEqual(base.bike);
    expect(rider.poseClip).toEqual(base.poseClip);

    const bike = await catalog.load("bike-heavy", base);
    expect(bike.bike.mass).toBe(18);
    expect(bike.bike.geometry).toEqual(base.bike.geometry);
    expect(bike.rider).toEqual(base.rider);

    const movement = await catalog.load("move-linear", base);
    expect(movement.poseClip.interpolation).toBe("linear");
    expect(movement.poseClip.keys).toEqual(base.poseClip.keys);
    expect(movement.rider).toEqual(base.rider);

    const jump = await catalog.load("jump-big", base);
    expect(jump.jump.gap).toBe(7.5);
    expect(jump.entry.speed).toBe(9.5);
    expect(jump.rider).toEqual(base.rider);
    expect(jump.bike).toEqual(base.bike);
  });

  it("duplicates presets into a new scenario identity without mutating the original", async () => {
    const baseScenario = fixtures.createScenario();
    const presets: Preset[] = [
      makePreset({
        id: "rider-power",
        category: "rider",
        name: "Power rider",
        patch: {
          rider: {
            strengthScale: 1.25,
            mass: 81
          }
        }
      })
    ];

    const catalog = createScenarioCatalog({
      baseScenario,
      presets,
      solverGateway: { analyzeSpeedWindow: vi.fn().mockResolvedValue(measuredWindow) }
    });

    const loaded = await catalog.load("rider-power");
    const duplicated = await catalog.duplicate("rider-power");

    expect(duplicated.id).not.toBe(loaded.id);
    expect(duplicated.name).toContain("Copy");

    (duplicated as Scenario).rider.mass = 120;
    const loadedAgain = await catalog.load("rider-power");
    expect(loadedAgain.rider.mass).toBe(81);
  });

  it("memoizes speed-window analysis by geometry hash and preserves unavailable reasons", async () => {
    const presets: Preset[] = [
      makePreset({
        id: "jump-a",
        category: "jump",
        name: "Jump A",
        patch: {
          jump: {
            lipHeight: 1.1,
            lipAngle: 0.81,
            transitionLength: 1.6,
            gap: 5.8,
            stepDelta: 0,
            landingAngle: 0.35,
            landingLength: 8,
            rollout: 11
          }
        }
      }),
      makePreset({
        id: "jump-b",
        category: "jump",
        name: "Jump B",
        patch: {
          jump: {
            lipHeight: 1.1,
            lipAngle: 0.81,
            transitionLength: 1.6,
            gap: 5.8,
            stepDelta: 0,
            landingAngle: 0.35,
            landingLength: 8,
            rollout: 11
          }
        }
      }),
      makePreset({
        id: "jump-c",
        category: "jump",
        name: "Jump C",
        patch: {
          jump: {
            lipHeight: 1.3,
            lipAngle: 0.95,
            transitionLength: 1.4,
            gap: 7,
            stepDelta: 0,
            landingAngle: 0.42,
            landingLength: 7,
            rollout: 10
          }
        }
      })
    ];

    const analyzeSpeedWindow = vi
      .fn()
      .mockResolvedValueOnce(measuredWindow)
      .mockResolvedValueOnce(unavailableWindow);

    const catalog = createScenarioCatalog({
      baseScenario: fixtures.createScenario(),
      presets,
      solverGateway: { analyzeSpeedWindow }
    });

    const jumps = await catalog.list("jump");
    expect(analyzeSpeedWindow).toHaveBeenCalledTimes(2);
    expect(jumps[0]?.speedWindow?.status).toBe("measured");
    expect(jumps[1]?.speedWindow?.status).toBe("measured");
    expect(jumps[2]?.speedWindow).toEqual(unavailableWindow);
    expect(jumps[2]?.speedWindow?.reason).toBeTruthy();
  });

  it("does not reuse speed-window analysis across distinct v3 bicycle geometry", async () => {
    const presets: Preset[] = [
      makePreset({ id: "bike-a", category: "jump", name: "Bike A" }),
      makePreset({
        id: "bike-b",
        category: "jump",
        name: "Bike B",
        patch: { bike: { geometry: { seatTubeLength: 0.36 } } }
      })
    ];
    const analyzeSpeedWindow = vi.fn().mockResolvedValue(measuredWindow);
    const catalog = createScenarioCatalog({
      baseScenario: fixtures.createScenario(),
      presets,
      solverGateway: { analyzeSpeedWindow }
    });

    await catalog.list("jump");

    expect(analyzeSpeedWindow).toHaveBeenCalledTimes(2);
  });
});
