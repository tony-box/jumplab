import {
  PROTOCOL_VERSION,
  bikeGeometryInspectedEventSchema,
  designValidatedEventSchema,
  hashScenario,
  poseEditResolvedEventSchema,
  readyEventSchema,
  type BikeSpec,
  type DesignValidation,
  type EntrySpeedWindowInfo,
  type PoseEditResolution,
  type PoseSample,
  type PoseTargets,
  type Scenario,
  type SolverCapabilityManifest,
  type TerrainProfile,
  type WorkerCommand,
  type WorkerErrorCode,
  type WorkerEvent
} from "../../../../packages/schema/src/index";
import initPhysics, * as physicsModule from "../../../../crates/physics-core/pkg/physics_core.js";

import type { SolverGateway } from "../app/services";
import { versionManifest } from "../app/version-manifest";
import { createPhysicsController } from "./controller";
import { createWorkerRuntime, type WasmExports } from "./physics.worker";
import { assembleRunArtifact } from "../features/workbench/solve-run";

type Runtime = { handleCommand: (command: WorkerCommand) => WorkerEvent[] };

type RuntimeFactory = () => Promise<Runtime>;

const createDefaultRuntimeFactory = (): RuntimeFactory => {
  let runtimePromise: Promise<Runtime> | null = null;

  return () => {
    if (runtimePromise) {
      return runtimePromise;
    }

    runtimePromise = (async () => {
      await initPhysics();
      const terrainProfileJson = Reflect.get(physicsModule, "terrainProfileJson");
      const inspectBikeGeometry = Reflect.get(physicsModule, "inspectBikeGeometry");
      const resolvePoseEditJson = Reflect.get(physicsModule, "resolvePoseEditJson");
      const validateDesignJson = Reflect.get(physicsModule, "validateDesignJson");
      const wasm: WasmExports = {
        solveScenarioJson: physicsModule.solveScenarioJson,
        solveFrameBuffer: physicsModule.solveFrameBuffer,
        solveTelemetryBuffer: physicsModule.solveTelemetryBuffer,
        samplePoseJson: physicsModule.samplePoseJson,
        analyzeSpeedWindowJson: physicsModule.analyzeSpeedWindowJson,
        terrainProfileJson: (scenarioJson, step) => {
          if (typeof terrainProfileJson !== "function") {
            throw new Error("terrain_profile_unavailable");
          }
          return terrainProfileJson(scenarioJson, step) as string;
        },
        inspectBikeGeometry: (bikeJson) => {
          if (typeof inspectBikeGeometry !== "function") {
            throw new Error("bike_geometry_inspection_unavailable");
          }
          return inspectBikeGeometry(bikeJson) as string;
        },
        resolvePoseEditJson: (
          scenarioJson,
          keyIndex,
          baselineTargetsJson,
          requestedTargetsJson
        ) => {
          if (typeof resolvePoseEditJson !== "function") {
            throw new Error("pose_edit_resolution_unavailable");
          }
          return resolvePoseEditJson(
            scenarioJson,
            keyIndex,
            baselineTargetsJson,
            requestedTargetsJson
          ) as string;
        },
        validateDesignJson: (scenarioJson) => {
          if (typeof validateDesignJson !== "function") {
            throw new Error("design_validation_unavailable");
          }
          return validateDesignJson(scenarioJson) as string;
        },
        capabilitiesJson: physicsModule.capabilitiesJson
      };

      return createWorkerRuntime(wasm, createPhysicsController());
    })();

    return runtimePromise;
  };
};

const createRequest = <TType extends WorkerCommand["type"]>(
  type: TType,
  payload: Omit<Extract<WorkerCommand, { type: TType }>, "protocolVersion" | "type" | "requestId">
): Extract<WorkerCommand, { type: TType }> =>
  ({
    protocolVersion: PROTOCOL_VERSION,
    type,
    requestId: crypto.randomUUID(),
    ...(payload as object)
  }) as Extract<WorkerCommand, { type: TType }>;

export class SolverGatewayError extends Error {
  constructor(
    readonly code: WorkerErrorCode,
    message: string,
    readonly recoverable: boolean
  ) {
    super(message);
    this.name = "SolverGatewayError";
  }
}

const correlatedEvents = (events: WorkerEvent[], requestId: string): WorkerEvent[] =>
  events.filter((event) => event.requestId === requestId);

const throwCorrelatedError = (events: WorkerEvent[]): void => {
  const error = events.find((event) => event.type === "error");
  if (error?.type === "error") {
    throw new SolverGatewayError(error.code, error.message, error.recoverable);
  }
};

export const createSolverGateway = (
  runtimeFactory: RuntimeFactory = createDefaultRuntimeFactory()
): SolverGateway => {
  let manifest: SolverCapabilityManifest | null = null;
  let disposed = false;
  const cancelledRunIds = new Set<string>();
  const terrainCache = new Map<string, Promise<TerrainProfile>>();

  const withRuntime = async <T>(execute: (runtime: Runtime) => T): Promise<T> => {
    if (disposed) {
      throw new Error("solver_disposed");
    }
    const runtime = await runtimeFactory();
    return execute(runtime);
  };

  const initialize: SolverGateway["initialize"] = async (appVersion, expectedSolverVersion) =>
    withRuntime((runtime) => {
      if (manifest) {
        return manifest;
      }

      const events = runtime.handleCommand(
        createRequest("init", {
          appVersion,
          expectedSolverVersion
        })
      );
      const ready = events.find((event) => event.type === "ready");
      if (!ready) {
        throw new Error("core_init_failed");
      }
      manifest = readyEventSchema.parse(ready).capabilities;
      return manifest;
    });

  const solve: SolverGateway["solve"] = async (runId, scenario) =>
    withRuntime(async (runtime) => {
      if (!manifest) {
        await initialize(versionManifest.app, versionManifest.solver);
      }

      const events = runtime.handleCommand(
        createRequest("solve", {
          runId,
          scenario
        })
      );

      let highestProgress = 0;
      let resultEvent: Extract<WorkerEvent, { type: "result" }> | null = null;

      for (const event of events) {
        if (event.type === "progress") {
          highestProgress = Math.max(highestProgress, event.fraction);
          continue;
        }

        if (event.type === "error") {
          throw new SolverGatewayError(event.code, event.message, event.recoverable);
        }

        if (event.type === "result") {
          if (cancelledRunIds.has(runId)) {
            throw new Error("solve_cancelled");
          }
          if (event.runId !== runId) {
            continue;
          }
          resultEvent = event;
        }
      }

      if (!resultEvent) {
        throw new Error(highestProgress > 0 ? "late_result_rejected" : "result_missing");
      }

      return assembleRunArtifact({
        runId,
        scenario,
        manifest: resultEvent.manifest,
        source: resultEvent.source,
        frameBuffer: resultEvent.frameBuffer,
        telemetryBuffer: resultEvent.telemetryBuffer
      });
    });

  const cancel: SolverGateway["cancel"] = async (runId) =>
    withRuntime((runtime) => {
      cancelledRunIds.add(runId);
      runtime.handleCommand(
        createRequest("cancel", {
          runId
        })
      );
    });

  const inspectBikeGeometry = async (bike: BikeSpec) =>
    withRuntime((runtime) => {
      const request = createRequest("inspect-bike-geometry", { bike });
      const events = correlatedEvents(runtime.handleCommand(request), request.requestId);
      throwCorrelatedError(events);
      const inspected = events.find((event) => event.type === "bike-geometry-inspected");
      if (!inspected) {
        throw new Error("bike_geometry_inspection_unavailable");
      }
      return bikeGeometryInspectedEventSchema.parse(inspected).inspection;
    });

  const resolvePoseEdit = async (
    scenario: Scenario,
    keyIndex: number,
    baselineTargets: PoseTargets,
    requestedTargets: PoseTargets
  ): Promise<PoseEditResolution> =>
    withRuntime((runtime) => {
      const request = createRequest("resolve-pose-edit", {
        scenario,
        keyIndex,
        baselineTargets,
        requestedTargets
      });
      const events = correlatedEvents(runtime.handleCommand(request), request.requestId);
      throwCorrelatedError(events);
      const resolved = events.find((event) => event.type === "pose-edit-resolved");
      if (!resolved) {
        throw new Error("pose_edit_resolution_unavailable");
      }
      return poseEditResolvedEventSchema.parse(resolved).resolution;
    });

  const validateDesign = async (scenario: Scenario): Promise<DesignValidation> =>
    withRuntime((runtime) => {
      const request = createRequest("validate-design", { scenario });
      const events = correlatedEvents(runtime.handleCommand(request), request.requestId);
      throwCorrelatedError(events);
      const validated = events.find((event) => event.type === "design-validated");
      if (!validated) {
        throw new Error("design_validation_unavailable");
      }
      return designValidatedEventSchema.parse(validated).validation;
    });

  const samplePose: SolverGateway["samplePose"] = async (
    scenario: Scenario,
    s: number
  ): Promise<PoseSample> =>
    withRuntime((runtime) => {
      const events = runtime.handleCommand(
        createRequest("sample-pose", {
          poseClip: scenario.poseClip,
          s,
          rider: scenario.rider,
          bike: scenario.bike
        })
      );
      const sample = events.find((event) => event.type === "pose-sample");
      if (!sample) {
        throw new Error("pose_sample_unavailable");
      }
      return sample.sample;
    });

  const analyzeSpeedWindow: SolverGateway["analyzeSpeedWindow"] = async (
    scenario
  ): Promise<EntrySpeedWindowInfo> =>
    withRuntime((runtime) => {
      const events = runtime.handleCommand(
        createRequest("analyze-speed-window", {
          scenario
        })
      );
      const window = events.find((event) => event.type === "speed-window");
      if (!window) {
        throw new Error("speed_window_unavailable");
      }
      return {
        minimum: window.window.minimum,
        maximum: window.window.maximum,
        status: window.window.status,
        reason: window.window.reason
      };
    });

  const terrain: SolverGateway["terrain"] = async (scenario, step) => {
    if (!Number.isFinite(step)) {
      throw new Error("terrain_step_invalid");
    }

    return withRuntime(async (runtime) => {
      const cacheKey = `${await hashScenario(scenario)}:${String(step)}`;
      let pendingProfile = terrainCache.get(cacheKey);

      if (!pendingProfile) {
        pendingProfile = Promise.resolve().then(() => {
          const events = runtime.handleCommand(
            createRequest("terrain", {
              scenario,
              step
            })
          );
          const error = events.find((event) => event.type === "error");
          if (error) {
            throw new Error(error.message);
          }
          const terrainEvent = events.find((event) => event.type === "terrain");
          if (!terrainEvent) {
            throw new Error("terrain_profile_unavailable");
          }
          return terrainEvent.profile;
        });
        terrainCache.set(cacheKey, pendingProfile);
        pendingProfile.catch(() => terrainCache.delete(cacheKey));
      }

      return structuredClone(await pendingProfile);
    });
  };

  const dispose: SolverGateway["dispose"] = async () =>
    withRuntime((runtime) => {
      disposed = true;
      runtime.handleCommand(createRequest("dispose", {}));
    });

  return {
    initialize,
    solve,
    cancel,
    inspectBikeGeometry,
    resolvePoseEdit,
    validateDesign,
    samplePose,
    analyzeSpeedWindow,
    terrain,
    dispose
  };
};
