import {
  FRAME_LAYOUT_FIELDS,
  FRAME_LAYOUT_VERSION,
  FRAME_STRIDE_FLOAT32,
  PROTOCOL_VERSION,
  SOLVER_VERSION,
  TELEMETRY_CHANNELS,
  TELEMETRY_LAYOUT_VERSION,
  bikeGeometryInspectionSchema,
  designValidationSchema,
  entrySpeedWindowSchema,
  poseEditResolutionSchema,
  poseSampleSchema,
  runResultSchema,
  solverCapabilityManifestSchema,
  terrainProfileSchema,
  type RunResult,
  type WorkerCommand,
  type WorkerErrorCode,
  type WorkerEvent
} from "../../../../packages/schema/src/index";

/** Result of the core's single `solve` export: manifest JSON plus binary rows. */
export type WasmSolveResult = {
  readonly manifest: string;
  readonly frames: Float32Array;
  readonly telemetry: Float32Array;
  free?: () => void;
};

export type WasmExports = {
  solve: (scenarioJson: string, runId: string) => WasmSolveResult;
  versionsJson: () => string;
  samplePoseJson: (poseClipJson: string, s: number, riderJson: string, bikeJson: string) => string;
  analyzeSpeedWindowJson: (scenarioJson: string) => string;
  terrainProfileJson: (scenarioJson: string, step: number) => string;
  inspectBikeGeometry: (bikeJson: string) => string;
  resolvePoseEditJson: (
    scenarioJson: string,
    keyIndex: number,
    baselineTargetsJson: string,
    requestedTargetsJson: string
  ) => string;
  validateDesignJson: (scenarioJson: string) => string;
  capabilitiesJson: () => string;
};

export type WorkerRuntime = { handleCommand: (command: WorkerCommand) => WorkerEvent[] };

type CoreVersions = {
  protocolVersion: number;
  frameLayoutVersion: number;
  telemetryLayoutVersion: number;
  modelVersion: string;
  solverVersion: string;
  frameFields: string[];
  telemetryChannels: { name: string; unit: string }[];
};

type CoreSolveManifest = {
  scenarioHash: string;
  solverVersion: string;
  modelVersion: string;
  frameLayoutVersion: number;
  outputHz: number;
  strideFloat32: number;
  frameCount: number;
  telemetryStrideFloat32: number;
  phases: RunResult["phases"];
  metrics: RunResult["metrics"];
  landing: RunResult["landing"];
  resultHash: string;
};

/** wasm-bindgen throws plain strings, not `Error` objects. */
export const coreErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const isCoreCrash = (error: unknown): boolean =>
  typeof WebAssembly !== "undefined" && error instanceof WebAssembly.RuntimeError;

const classifyCoreError = (message: string): WorkerErrorCode => {
  if (message.includes("design-invalid")) return "design-invalid";
  if (message.includes("invalid-baseline")) return "invalid-baseline";
  if (message.includes("unsupported-schema") || message.includes("unsupported schemaVersion")) {
    return "unsupported-schema";
  }
  if (message.includes("invalid bike")) return "invalid-bike-json";
  if (message.includes("invalid scenario")) {
    return "invalid-scenario";
  }
  return "internal-error";
};

const errorEvent = (
  command: WorkerCommand,
  code: WorkerErrorCode,
  message: string,
  recoverable: boolean
): WorkerEvent => ({
  protocolVersion: PROTOCOL_VERSION,
  type: "error",
  requestId: command.requestId,
  runId: command.type === "solve" ? command.runId : null,
  code,
  message: message || "Physics core failed",
  details: { operation: command.type },
  recoverable
});

/** Checks the loaded core against the versions and layouts this app was built for. */
export const checkCoreVersions = (versions: CoreVersions): string | null => {
  if (versions.protocolVersion !== PROTOCOL_VERSION) {
    return `core protocol ${versions.protocolVersion} does not match app protocol ${PROTOCOL_VERSION}`;
  }
  if (versions.solverVersion !== SOLVER_VERSION) {
    return `core solver ${versions.solverVersion} does not match ${SOLVER_VERSION}`;
  }
  if (
    versions.frameLayoutVersion !== FRAME_LAYOUT_VERSION ||
    versions.frameFields.length !== FRAME_STRIDE_FLOAT32 ||
    versions.frameFields.some((name, index) => FRAME_LAYOUT_FIELDS[index]?.name !== name)
  ) {
    return "core frame layout does not match the app's frame layout";
  }
  if (
    versions.telemetryLayoutVersion !== TELEMETRY_LAYOUT_VERSION ||
    versions.telemetryChannels.length !== TELEMETRY_CHANNELS.length ||
    versions.telemetryChannels.some(
      (channel, index) => TELEMETRY_CHANNELS[index]?.name !== channel.name
    )
  ) {
    return "core telemetry layout does not match the app's telemetry layout";
  }
  return null;
};

const toRunResult = (
  runId: string,
  manifest: CoreSolveManifest,
  frames: Float32Array,
  telemetry: Float32Array
): RunResult => {
  if (manifest.strideFloat32 !== FRAME_STRIDE_FLOAT32) {
    throw new Error(`buffer-layout-error: core stride ${manifest.strideFloat32}`);
  }
  if (frames.length !== manifest.frameCount * FRAME_STRIDE_FLOAT32) {
    throw new Error("buffer-layout-error: frame buffer length does not match frameCount");
  }
  if (manifest.telemetryStrideFloat32 !== TELEMETRY_CHANNELS.length) {
    throw new Error(
      `buffer-layout-error: core telemetry stride ${manifest.telemetryStrideFloat32}`
    );
  }
  if (telemetry.length !== manifest.frameCount * manifest.telemetryStrideFloat32) {
    throw new Error("buffer-layout-error: telemetry buffer length does not match frameCount");
  }
  return runResultSchema.parse({
    runId,
    scenarioHash: manifest.scenarioHash,
    solverVersion: manifest.solverVersion,
    frameLayout: {
      version: FRAME_LAYOUT_VERSION,
      strideFloat32: FRAME_STRIDE_FLOAT32,
      fields: FRAME_LAYOUT_FIELDS.map((field) => ({ ...field }))
    },
    frameCount: manifest.frameCount,
    outputHz: manifest.outputHz,
    phases: manifest.phases,
    metrics: manifest.metrics,
    landing: manifest.landing,
    telemetry: {
      layoutVersion: TELEMETRY_LAYOUT_VERSION,
      strideFloat32: manifest.telemetryStrideFloat32,
      sampleCount: manifest.frameCount,
      channels: TELEMETRY_CHANNELS.map((channel, offset) => ({ ...channel, offset }))
    },
    resultHash: manifest.resultHash
  });
};

/** Copies wasm-owned rows into standalone buffers that can be transferred to the main thread. */
const ownedBuffer = (values: Float32Array): ArrayBuffer => new Float32Array(values).buffer;

export const createWorkerRuntime = (wasm: WasmExports): WorkerRuntime => {
  const handle = (command: WorkerCommand): WorkerEvent => {
    switch (command.type) {
      case "init": {
        const versions = JSON.parse(wasm.versionsJson()) as CoreVersions;
        const mismatch = checkCoreVersions(versions);
        if (mismatch) {
          const code: WorkerErrorCode =
            versions.protocolVersion !== PROTOCOL_VERSION
              ? "protocol-mismatch"
              : "solver-version-mismatch";
          return errorEvent(command, code, mismatch, false);
        }
        const capabilities = JSON.parse(wasm.capabilitiesJson());
        return {
          protocolVersion: PROTOCOL_VERSION,
          type: "ready",
          requestId: command.requestId,
          solverVersion: versions.solverVersion,
          modelVersion: versions.modelVersion,
          capabilities: solverCapabilityManifestSchema.parse({
            protocolVersion: PROTOCOL_VERSION,
            solverVersion: versions.solverVersion,
            modelVersion: versions.modelVersion,
            deterministic: true,
            supportedScenarioPaths: capabilities.supportedScenarioPaths ?? [],
            supportedOutputs: capabilities.supportedOutputs ?? [],
            ccd: Boolean(capabilities.ccd),
            contactImpulse: Boolean(capabilities.contactImpulse),
            riderCoupling: Boolean(capabilities.riderCoupling),
            riderInstinct: Boolean(capabilities.riderInstinct),
            suspension: Boolean(capabilities.suspension)
          })
        };
      }
      case "solve": {
        const result = wasm.solve(JSON.stringify(command.scenario), command.runId);
        try {
          const manifest = JSON.parse(result.manifest) as CoreSolveManifest;
          const frames = result.frames;
          const telemetry = result.telemetry;
          return {
            protocolVersion: PROTOCOL_VERSION,
            type: "result",
            requestId: command.requestId,
            runId: command.runId,
            source: "solver",
            manifest: toRunResult(command.runId, manifest, frames, telemetry),
            frameBuffer: ownedBuffer(frames),
            telemetryBuffer: ownedBuffer(telemetry)
          };
        } finally {
          result.free?.();
        }
      }
      case "cancel":
        // Cancellation terminates the worker; a cancel that reaches the core finds nothing running.
        return {
          protocolVersion: PROTOCOL_VERSION,
          type: "cancelled",
          requestId: command.requestId,
          runId: command.runId
        };
      case "sample-pose":
        return {
          protocolVersion: PROTOCOL_VERSION,
          type: "pose-sample",
          requestId: command.requestId,
          sample: poseSampleSchema.parse(
            JSON.parse(
              wasm.samplePoseJson(
                JSON.stringify(command.poseClip),
                command.s,
                JSON.stringify(command.rider),
                JSON.stringify(command.bike)
              )
            )
          )
        };
      case "analyze-speed-window":
        return {
          protocolVersion: PROTOCOL_VERSION,
          type: "speed-window",
          requestId: command.requestId,
          window: entrySpeedWindowSchema.parse(
            JSON.parse(wasm.analyzeSpeedWindowJson(JSON.stringify(command.scenario)))
          )
        };
      case "terrain":
        return {
          protocolVersion: PROTOCOL_VERSION,
          type: "terrain",
          requestId: command.requestId,
          profile: terrainProfileSchema.parse(
            JSON.parse(wasm.terrainProfileJson(JSON.stringify(command.scenario), command.step))
          )
        };
      case "inspect-bike-geometry":
        return {
          protocolVersion: PROTOCOL_VERSION,
          type: "bike-geometry-inspected",
          requestId: command.requestId,
          inspection: bikeGeometryInspectionSchema.parse(
            JSON.parse(wasm.inspectBikeGeometry(JSON.stringify(command.bike)))
          )
        };
      case "resolve-pose-edit":
        return {
          protocolVersion: PROTOCOL_VERSION,
          type: "pose-edit-resolved",
          requestId: command.requestId,
          resolution: poseEditResolutionSchema.parse(
            JSON.parse(
              wasm.resolvePoseEditJson(
                JSON.stringify(command.scenario),
                command.keyIndex,
                JSON.stringify(command.baselineTargets),
                JSON.stringify(command.requestedTargets)
              )
            )
          )
        };
      case "validate-design":
        return {
          protocolVersion: PROTOCOL_VERSION,
          type: "design-validated",
          requestId: command.requestId,
          validation: designValidationSchema.parse(
            JSON.parse(wasm.validateDesignJson(JSON.stringify(command.scenario)))
          )
        };
      case "dispose":
        return {
          protocolVersion: PROTOCOL_VERSION,
          type: "disposed",
          requestId: command.requestId
        };
    }
  };

  return {
    handleCommand: (command) => {
      try {
        return [handle(command)];
      } catch (error) {
        if (isCoreCrash(error)) {
          return [errorEvent(command, "core-crashed", coreErrorMessage(error), false)];
        }
        const message = coreErrorMessage(error);
        const code = message.startsWith("buffer-layout-error")
          ? "buffer-layout-error"
          : classifyCoreError(message);
        return [errorEvent(command, code, message, code !== "buffer-layout-error")];
      }
    }
  };
};
