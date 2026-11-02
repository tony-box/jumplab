import {
  PROTOCOL_VERSION,
  terrainProfileSchema,
  type WorkerCommand,
  type WorkerEvent
} from "../../../../packages/schema/src/worker-protocol";
import {
  FRAME_LAYOUT_FIELDS,
  FRAME_LAYOUT_VERSION,
  FRAME_STRIDE_FLOAT32,
  bikeGeometryInspectionSchema,
  designValidationSchema,
  poseEditResolutionSchema,
  type Metric,
  type Phase
} from "../../../../packages/schema/src/run-result";

import { versionManifest } from "../app/version-manifest";
import type { PhysicsController } from "./controller";

type SolveCommand = Extract<WorkerCommand, { type: "solve" }>;
type SamplePoseCommand = Extract<WorkerCommand, { type: "sample-pose" }>;
type AnalyzeSpeedWindowCommand = Extract<WorkerCommand, { type: "analyze-speed-window" }>;
type TerrainCommand = Extract<WorkerCommand, { type: "terrain" }>;
type InspectBikeGeometryCommand = Extract<WorkerCommand, { type: "inspect-bike-geometry" }>;
type ResolvePoseEditCommand = Extract<WorkerCommand, { type: "resolve-pose-edit" }>;
type ValidateDesignCommand = Extract<WorkerCommand, { type: "validate-design" }>;

type WasmPhase = {
  name: Phase["name"];
  start_frame: number;
  end_frame: number;
};

type WasmSolveOutput = {
  runId: string;
  scenarioHash: string;
  solverVersion: string;
  outputHz: number;
  frameCount?: number;
  phases: WasmPhase[];
  metrics: Record<string, Metric>;
  resultHash: string;
  frames?: unknown[];
};

export type WasmExports = {
  solveScenarioJson: (scenarioJson: string, runId: string) => string;
  solveFrameBuffer: (scenarioJson: string, runId: string) => Float32Array | number[];
  solveTelemetryBuffer: (scenarioJson: string, runId: string) => Float32Array | number[];
  samplePoseJson: (poseClipJson: string, s: number, riderJson: string, bikeJson: string) => string;
  analyzeSpeedWindowJson: (scenarioJson: string) => string;
  terrainProfileJson: (scenarioJson: string, step: number) => string;
  inspectBikeGeometry: (bikeJson: string) => string;
  resolvePoseEditJson?: (
    scenarioJson: string,
    keyIndex: number,
    baselineTargetsJson: string,
    requestedTargetsJson: string
  ) => string;
  validateDesignJson?: (scenarioJson: string) => string;
  capabilitiesJson: () => string;
};

const arrayToBuffer = (data: Float32Array | number[]): ArrayBuffer => {
  const values = data instanceof Float32Array ? data : Float32Array.from(data);
  return new Float32Array(values).buffer;
};

const normalizePhases = (phases: WasmPhase[]): Phase[] => {
  const normalized: Phase[] = [];
  for (const phase of phases) {
    const previousEnd = normalized.at(-1)?.endFrame ?? -1;
    const startFrame = Math.max(phase.start_frame, previousEnd + 1);
    if (startFrame > phase.end_frame) continue;
    normalized.push({ name: phase.name, startFrame, endFrame: phase.end_frame });
  }
  return normalized;
};

const coreUnavailable = (
  command: ResolvePoseEditCommand | ValidateDesignCommand
): Extract<WorkerEvent, { type: "error" }> => ({
  protocolVersion: PROTOCOL_VERSION,
  type: "error",
  requestId: command.requestId,
  runId: null,
  code: "core-unavailable",
  message: `${command.type} is unavailable in the loaded physics core`,
  details: { operation: command.type },
  recoverable: false
});

export const createWorkerRuntime = (
  wasm: WasmExports,
  controller: PhysicsController
): { handleCommand: (command: WorkerCommand) => WorkerEvent[] } => {
  const handleSolve = (command: SolveCommand): WorkerEvent[] => {
    if (wasm.validateDesignJson) {
      const validation = designValidationSchema.parse(
        JSON.parse(wasm.validateDesignJson(JSON.stringify(command.scenario)))
      );
      if (!validation.canSolve) {
        const firstConflict = validation.poseKeys.flatMap((key) => key.conflicts)[0];
        return [
          {
            protocolVersion: PROTOCOL_VERSION,
            type: "error",
            requestId: command.requestId,
            runId: command.runId,
            code: "design-invalid",
            message: firstConflict?.message ?? "Bike and pose design is invalid",
            details: {
              conflictCount: validation.conflictCount,
              conflictCode: firstConflict?.code ?? validation.geometry.issues[0]?.code ?? "unknown"
            },
            recoverable: true
          }
        ];
      }
    }
    controller.beginRun(command.runId);

    const acceptedFraction = controller.acceptProgressForRun(command.runId, 1) ?? 1;

    const progress: WorkerEvent = {
      protocolVersion: PROTOCOL_VERSION,
      type: "progress",
      requestId: command.requestId,
      runId: command.runId,
      completedSteps: 1,
      totalSteps: 1,
      fraction: acceptedFraction
    };

    const solveOutput = JSON.parse(
      wasm.solveScenarioJson(JSON.stringify(command.scenario), command.runId)
    ) as WasmSolveOutput;

    const frameBuffer = arrayToBuffer(
      wasm.solveFrameBuffer(JSON.stringify(command.scenario), command.runId)
    );
    const telemetryBuffer = arrayToBuffer(
      wasm.solveTelemetryBuffer(JSON.stringify(command.scenario), command.runId)
    );

    const accepted = controller.acceptResultForRun(command.runId);
    if (!accepted) {
      return [progress];
    }

    const result: WorkerEvent = {
      protocolVersion: PROTOCOL_VERSION,
      type: "result",
      requestId: command.requestId,
      runId: command.runId,
      source: "solver",
      manifest: {
        runId: command.runId,
        scenarioHash: solveOutput.scenarioHash,
        solverVersion: solveOutput.solverVersion,
        frameLayout: {
          version: FRAME_LAYOUT_VERSION,
          strideFloat32: FRAME_STRIDE_FLOAT32,
          fields: FRAME_LAYOUT_FIELDS.map((field) => ({ ...field }))
        },
        frameCount:
          solveOutput.frames?.length ??
          Math.floor(frameBuffer.byteLength / (FRAME_STRIDE_FLOAT32 * 4)),
        outputHz: solveOutput.outputHz,
        phases: normalizePhases(solveOutput.phases),
        metrics: solveOutput.metrics,
        telemetry: {
          layoutVersion: 1,
          sampleCount: telemetryBuffer.byteLength / 4,
          channels: [
            {
              name: "contactImpulse",
              unit: "N*s",
              offset: 0,
              count: Math.floor(telemetryBuffer.byteLength / 16)
            }
          ]
        },
        resultHash: solveOutput.resultHash
      },
      frameBuffer,
      telemetryBuffer
    };

    return [progress, result];
  };

  const handleSamplePose = (command: SamplePoseCommand): WorkerEvent[] => {
    const sample = JSON.parse(
      wasm.samplePoseJson(
        JSON.stringify(command.poseClip),
        command.s,
        JSON.stringify(command.rider),
        JSON.stringify(command.bike)
      )
    );

    return [
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "pose-sample",
        requestId: command.requestId,
        sample
      }
    ];
  };

  const handleSpeedWindow = (command: AnalyzeSpeedWindowCommand): WorkerEvent[] => {
    const window = JSON.parse(wasm.analyzeSpeedWindowJson(JSON.stringify(command.scenario)));
    return [
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "speed-window",
        requestId: command.requestId,
        window
      }
    ];
  };

  const handleTerrain = (command: TerrainCommand): WorkerEvent[] => {
    const profile = terrainProfileSchema.parse(
      JSON.parse(wasm.terrainProfileJson(JSON.stringify(command.scenario), command.step))
    );
    return [
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "terrain",
        requestId: command.requestId,
        profile
      }
    ];
  };

  const handleBikeGeometryInspection = (command: InspectBikeGeometryCommand): WorkerEvent[] => {
    try {
      const inspection = bikeGeometryInspectionSchema.parse(
        JSON.parse(wasm.inspectBikeGeometry(JSON.stringify(command.bike)))
      );
      return [
        {
          protocolVersion: PROTOCOL_VERSION,
          type: "bike-geometry-inspected",
          requestId: command.requestId,
          inspection
        }
      ];
    } catch (error) {
      return [
        {
          protocolVersion: PROTOCOL_VERSION,
          type: "error",
          requestId: command.requestId,
          runId: null,
          code: "invalid-bike-json",
          message: error instanceof Error ? error.message : "Bike geometry inspection failed",
          details: { operation: command.type },
          recoverable: true
        }
      ];
    }
  };

  const handleResolvePoseEdit = (command: ResolvePoseEditCommand): WorkerEvent[] => {
    if (!wasm.resolvePoseEditJson) {
      return [coreUnavailable(command)];
    }
    try {
      const resolution = poseEditResolutionSchema.parse(
        JSON.parse(
          wasm.resolvePoseEditJson(
            JSON.stringify(command.scenario),
            command.keyIndex,
            JSON.stringify(command.baselineTargets),
            JSON.stringify(command.requestedTargets)
          )
        )
      );
      return [
        {
          protocolVersion: PROTOCOL_VERSION,
          type: "pose-edit-resolved",
          requestId: command.requestId,
          resolution
        }
      ];
    } catch (error) {
      const message = error instanceof Error ? error.message : "Pose edit resolution failed";
      return [
        {
          protocolVersion: PROTOCOL_VERSION,
          type: "error",
          requestId: command.requestId,
          runId: null,
          code: message.includes("invalid-baseline") ? "invalid-baseline" : "internal_error",
          message,
          details: { operation: command.type },
          recoverable: true
        }
      ];
    }
  };

  const handleValidateDesign = (command: ValidateDesignCommand): WorkerEvent[] => {
    if (!wasm.validateDesignJson) {
      return [coreUnavailable(command)];
    }
    try {
      const validation = designValidationSchema.parse(
        JSON.parse(wasm.validateDesignJson(JSON.stringify(command.scenario)))
      );
      return [
        {
          protocolVersion: PROTOCOL_VERSION,
          type: "design-validated",
          requestId: command.requestId,
          validation
        }
      ];
    } catch (error) {
      const message = error instanceof Error ? error.message : "Design validation failed";
      return [
        {
          protocolVersion: PROTOCOL_VERSION,
          type: "error",
          requestId: command.requestId,
          runId: null,
          code: message.includes("unsupported-schema") ? "unsupported-schema" : "internal_error",
          message,
          details: { operation: command.type },
          recoverable: false
        }
      ];
    }
  };

  const handleCommand = (command: WorkerCommand): WorkerEvent[] => {
    if (command.type === "init") {
      const capabilities = JSON.parse(wasm.capabilitiesJson());
      controller.markReady();
      return [
        {
          protocolVersion: PROTOCOL_VERSION,
          type: "ready",
          requestId: command.requestId,
          solverVersion: command.expectedSolverVersion,
          modelVersion: versionManifest.model,
          capabilities: {
            protocolVersion: PROTOCOL_VERSION,
            solverVersion: command.expectedSolverVersion,
            modelVersion: versionManifest.model,
            deterministic: true,
            supportedScenarioPaths: (capabilities.supportedScenarioPaths ?? []) as string[],
            supportedOutputs: (capabilities.supportedOutputs ?? []) as string[],
            ccd: Boolean(capabilities.ccd),
            contactImpulse: Boolean(capabilities.contactImpulse),
            motorWork: Boolean(capabilities.motorWork),
            jointTorque: Boolean(capabilities.jointTorque)
          }
        }
      ];
    }

    if (command.type === "solve") {
      return handleSolve(command);
    }

    if (command.type === "cancel") {
      controller.cancelRun(command.runId);
      return [
        {
          protocolVersion: PROTOCOL_VERSION,
          type: "cancelled",
          requestId: command.requestId,
          runId: command.runId
        }
      ];
    }

    if (command.type === "sample-pose") {
      return handleSamplePose(command);
    }

    if (command.type === "analyze-speed-window") {
      return handleSpeedWindow(command);
    }

    if (command.type === "terrain") {
      return handleTerrain(command);
    }

    if (command.type === "inspect-bike-geometry") {
      return handleBikeGeometryInspection(command);
    }

    if (command.type === "resolve-pose-edit") {
      return handleResolvePoseEdit(command);
    }

    if (command.type === "validate-design") {
      return handleValidateDesign(command);
    }

    controller.dispose();
    return [
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "disposed",
        requestId: command.requestId
      }
    ];
  };

  return {
    handleCommand
  };
};
