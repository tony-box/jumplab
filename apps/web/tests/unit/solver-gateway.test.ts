import { describe, expect, it } from "vitest";

import {
  PROTOCOL_VERSION,
  scenarioSchema,
  type WorkerCommand,
  type WorkerEvent
} from "../../../../packages/schema/src/index";
import scenarioJson from "../../../../tests/fixtures/scenarios/standard-v1.json";
import { createSolverGateway } from "../../src/solver/gateway";

describe("solver gateway terrain profiles", () => {
  it("caches by canonical scenario hash and sample step", async () => {
    let terrainCalls = 0;
    const runtime = {
      handleCommand(command: WorkerCommand): WorkerEvent[] {
        if (command.type !== "terrain") {
          return [];
        }

        terrainCalls += 1;
        return [
          {
            protocolVersion: PROTOCOL_VERSION,
            type: "terrain",
            requestId: command.requestId,
            profile: {
              segments: [
                {
                  id: "approach-takeoff",
                  kind: "approach-takeoff",
                  points: [
                    [command.scenario.entry.startX, 0],
                    [command.scenario.jump.lipHeight, command.scenario.jump.lipHeight]
                  ]
                }
              ],
              approachStartX: command.scenario.entry.startX,
              lipX: command.scenario.jump.lipHeight,
              landingStartX: command.scenario.jump.gap,
              sampleStep: command.step > 0 ? command.step : 0.25
            }
          }
        ];
      }
    };
    const gateway = createSolverGateway(async () => runtime);
    const scenario = scenarioSchema.parse(scenarioJson);

    const first = await gateway.terrain(scenario, 0.1);
    const repeated = await gateway.terrain(structuredClone(scenario), 0.1);
    expect(repeated).toEqual(first);
    expect(repeated).not.toBe(first);
    expect(terrainCalls).toBe(1);

    await gateway.terrain(scenario, 0.2);
    await gateway.terrain(
      {
        ...scenario,
        jump: { ...scenario.jump, lipHeight: scenario.jump.lipHeight + 0.1 }
      },
      0.1
    );
    expect(terrainCalls).toBe(3);
  });

  it("accepts only the geometry response correlated to its request", async () => {
    const scenario = scenarioSchema.parse(scenarioJson);
    const inspection = {
      modelVersion: 1 as const,
      valid: true,
      issues: [],
      closureResidual: 0.004,
      landmarks: {},
      members: [],
      protectedShapes: [],
      massProperties: {
        totalMass: scenario.bike.mass,
        centerOfGravity: { x: 0.57, y: 0.54 },
        planarInertia: 2.8,
        distributionVersion: 1 as const
      }
    };
    const runtime = {
      handleCommand(command: WorkerCommand): WorkerEvent[] {
        if (command.type !== "inspect-bike-geometry") {
          return [];
        }
        return [
          {
            protocolVersion: PROTOCOL_VERSION,
            type: "bike-geometry-inspected",
            requestId: "99999999-9999-4999-8999-999999999999",
            inspection: { ...inspection, closureResidual: 0.009 }
          },
          {
            protocolVersion: PROTOCOL_VERSION,
            type: "bike-geometry-inspected",
            requestId: command.requestId,
            inspection
          }
        ];
      }
    };

    await expect(
      createSolverGateway(async () => runtime).inspectBikeGeometry(scenario.bike)
    ).resolves.toEqual(inspection);
  });

  it("exposes pose resolution and design validation as typed unsupported operations", async () => {
    const scenario = scenarioSchema.parse(scenarioJson);
    const runtime = {
      handleCommand(command: WorkerCommand): WorkerEvent[] {
        return [
          {
            protocolVersion: PROTOCOL_VERSION,
            type: "error",
            requestId: command.requestId,
            runId: null,
            code: "operation-unsupported",
            message: `${command.type} requires Phase 3 clearance support`,
            details: { operation: command.type, requiredPhase: 3 },
            recoverable: false
          }
        ];
      }
    };
    const gateway = createSolverGateway(async () => runtime);
    const baseline = scenario.poseClip.keys[0].targets;
    const requested = scenario.poseClip.keys[1].targets;

    await expect(gateway.resolvePoseEdit(scenario, 0, baseline, requested)).rejects.toMatchObject({
      code: "operation-unsupported"
    });
    await expect(gateway.validateDesign(scenario)).rejects.toMatchObject({
      code: "operation-unsupported"
    });
  });
});
