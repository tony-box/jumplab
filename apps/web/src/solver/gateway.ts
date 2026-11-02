import {
  PROTOCOL_VERSION,
  hashScenario,
  workerEventSchema,
  type EntrySpeedWindowInfo,
  type Scenario,
  type SolverCapabilityManifest,
  type TerrainProfile,
  type WorkerCommand,
  type WorkerErrorCode,
  type WorkerEvent
} from "../../../../packages/schema/src/index";

import type { SolverGateway } from "../app/services";
import { versionManifest } from "../app/version-manifest";
import { assembleRunArtifact } from "../features/workbench/solve-run";
import type { WorkerRuntime } from "./physics.worker";

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

/** Delivers one command and resolves with its terminal event. */
export type SolverTransport = {
  request: (command: WorkerCommand, timeoutMs: number) => Promise<WorkerEvent>;
  /** Stops the core immediately, rejecting outstanding requests with `reason`. */
  terminate: (reason: WorkerErrorCode) => void;
};

/** Per-operation budgets; solves are the slowest single calls, speed windows run many solves. */
const TIMEOUTS_MS = {
  default: 15_000,
  solve: 60_000,
  "analyze-speed-window": 180_000
} as const;
const TERRAIN_CACHE_LIMIT = 32;

const timeoutFor = (command: WorkerCommand): number =>
  command.type === "solve" || command.type === "analyze-speed-window"
    ? TIMEOUTS_MS[command.type]
    : TIMEOUTS_MS.default;

type Pending = {
  resolve: (event: WorkerEvent) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** Runs the physics core in a dedicated module worker, respawning it after cancel or crash. */
export const createWorkerTransport = (
  spawn: () => Worker = () =>
    new Worker(new URL("./physics-worker-entry.ts", import.meta.url), { type: "module" })
): SolverTransport => {
  let worker: Worker | null = null;
  const pending = new Map<string, Pending>();

  const rejectAll = (code: WorkerErrorCode, message: string, recoverable: boolean): void => {
    for (const [requestId, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(new SolverGatewayError(code, message, recoverable));
      pending.delete(requestId);
    }
  };

  const terminate: SolverTransport["terminate"] = (reason) => {
    worker?.terminate();
    worker = null;
    rejectAll(reason, `Physics core stopped: ${reason}`, true);
  };

  const ensureWorker = (): Worker => {
    if (worker) return worker;
    const created = spawn();
    created.onmessage = (message: MessageEvent<unknown>) => {
      const parsed = workerEventSchema.safeParse(message.data);
      const requestId = (message.data as { requestId?: unknown } | null)?.requestId;
      const entry = typeof requestId === "string" ? pending.get(requestId) : undefined;
      if (!entry || typeof requestId !== "string") return;
      pending.delete(requestId);
      clearTimeout(entry.timer);
      if (parsed.success) {
        entry.resolve(parsed.data);
      } else {
        entry.reject(
          new SolverGatewayError(
            "buffer-layout-error",
            "Physics core sent a malformed event",
            false
          )
        );
      }
    };
    created.onerror = (event) => {
      event.preventDefault();
      created.terminate();
      if (worker === created) worker = null;
      rejectAll("core-crashed", event.message || "Physics worker crashed", true);
    };
    worker = created;
    return created;
  };

  const request: SolverTransport["request"] = (command, timeoutMs) =>
    new Promise<WorkerEvent>((resolve, reject) => {
      const target = ensureWorker();
      const timer = setTimeout(() => {
        pending.delete(command.requestId);
        // A stuck core cannot be interrupted any other way.
        terminate("timeout");
        reject(new SolverGatewayError("timeout", `${command.type} timed out`, true));
      }, timeoutMs);
      pending.set(command.requestId, { resolve, reject, timer });
      target.postMessage(command);
    });

  return { request, terminate };
};

/** Runs a worker runtime on the calling thread: used by tests and the fixture provider. */
export const createInProcessTransport = (
  runtimeFactory: () => Promise<WorkerRuntime>
): SolverTransport => {
  let runtime: Promise<WorkerRuntime> | null = null;
  return {
    request: async (command) => {
      runtime ??= runtimeFactory();
      const events = (await runtime).handleCommand(command);
      const terminal = events.filter((event) => event.type !== "progress").at(-1);
      if (!terminal) throw new SolverGatewayError("internal-error", "No event returned", true);
      return terminal;
    },
    terminate: () => {
      runtime = null;
    }
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

const expectEvent = <TType extends WorkerEvent["type"]>(
  event: WorkerEvent,
  type: TType
): Extract<WorkerEvent, { type: TType }> => {
  if (event.type === "error") {
    throw new SolverGatewayError(event.code, event.message, event.recoverable);
  }
  if (event.type !== type) {
    throw new SolverGatewayError(
      "internal-error",
      `Expected ${type}, received ${event.type}`,
      true
    );
  }
  return event as Extract<WorkerEvent, { type: TType }>;
};

const defaultTransport = (): SolverTransport => {
  if (typeof Worker === "undefined") {
    throw new Error("Web Workers are required to run the physics core");
  }
  return createWorkerTransport();
};

/**
 * `source` may be a transport or, for tests and fixtures, a factory for an in-process runtime.
 * By default the core runs in a dedicated Web Worker.
 */
export const createSolverGateway = (
  source?: SolverTransport | (() => Promise<WorkerRuntime>)
): SolverGateway => {
  let transport: SolverTransport | null =
    typeof source === "function" ? createInProcessTransport(source) : (source ?? null);
  let manifest: SolverCapabilityManifest | null = null;
  let disposed = false;
  let activeRunId: string | null = null;
  const terrainCache = new Map<string, Promise<TerrainProfile>>();

  const send = async <TType extends WorkerEvent["type"]>(
    command: WorkerCommand,
    expected: TType
  ): Promise<Extract<WorkerEvent, { type: TType }>> => {
    if (disposed) throw new Error("solver_disposed");
    transport ??= defaultTransport();
    return expectEvent(await transport.request(command, timeoutFor(command)), expected);
  };

  const initialize: SolverGateway["initialize"] = async (appVersion, expectedSolverVersion) => {
    if (manifest) return manifest;
    const ready = await send(createRequest("init", { appVersion, expectedSolverVersion }), "ready");
    manifest = ready.capabilities;
    return manifest;
  };

  const solve: SolverGateway["solve"] = async (runId, scenario) => {
    await initialize(versionManifest.app, versionManifest.solver);
    activeRunId = runId;
    try {
      const result = await send(createRequest("solve", { runId, scenario }), "result");
      if (result.runId !== runId) {
        throw new SolverGatewayError("internal-error", "Result belongs to another run", true);
      }
      return await assembleRunArtifact({
        runId,
        scenario,
        manifest: result.manifest,
        source: result.source,
        frameBuffer: result.frameBuffer,
        telemetryBuffer: result.telemetryBuffer
      });
    } finally {
      if (activeRunId === runId) activeRunId = null;
    }
  };

  const cancel: SolverGateway["cancel"] = async (runId) => {
    if (activeRunId !== runId) return;
    activeRunId = null;
    transport?.terminate("cancelled");
  };

  const terrain: SolverGateway["terrain"] = async (scenario, step) => {
    if (!Number.isFinite(step)) throw new Error("terrain_step_invalid");
    const cacheKey = `${await hashScenario(scenario)}:${String(step)}`;
    let profile = terrainCache.get(cacheKey);
    if (profile) {
      terrainCache.delete(cacheKey);
    } else {
      profile = send(createRequest("terrain", { scenario, step }), "terrain").then(
        (event) => event.profile
      );
      profile.catch(() => terrainCache.delete(cacheKey));
    }
    terrainCache.set(cacheKey, profile);
    while (terrainCache.size > TERRAIN_CACHE_LIMIT) {
      const oldest = terrainCache.keys().next().value;
      if (oldest === undefined) break;
      terrainCache.delete(oldest);
    }
    return structuredClone(await profile);
  };

  return {
    initialize,
    solve,
    cancel,
    inspectBikeGeometry: async (bike) =>
      (await send(createRequest("inspect-bike-geometry", { bike }), "bike-geometry-inspected"))
        .inspection,
    resolvePoseEdit: async (scenario, keyIndex, baselineTargets, requestedTargets) =>
      (
        await send(
          createRequest("resolve-pose-edit", {
            scenario,
            keyIndex,
            baselineTargets,
            requestedTargets
          }),
          "pose-edit-resolved"
        )
      ).resolution,
    validateDesign: async (scenario) =>
      (await send(createRequest("validate-design", { scenario }), "design-validated")).validation,
    samplePose: async (scenario: Scenario, s: number) =>
      (
        await send(
          createRequest("sample-pose", {
            poseClip: scenario.poseClip,
            s,
            rider: scenario.rider,
            bike: scenario.bike
          }),
          "pose-sample"
        )
      ).sample,
    analyzeSpeedWindow: async (scenario): Promise<EntrySpeedWindowInfo> => {
      const { window } = await send(
        createRequest("analyze-speed-window", { scenario }),
        "speed-window"
      );
      return {
        minimum: window.minimum,
        maximum: window.maximum,
        status: window.status,
        reason: window.reason
      };
    },
    terrain,
    dispose: async () => {
      disposed = true;
      transport?.terminate("cancelled");
      transport = null;
    }
  };
};
