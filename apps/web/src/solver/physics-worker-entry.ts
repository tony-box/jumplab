/// <reference lib="webworker" />
// Dedicated module worker that owns the physics core, keeping solves off the main thread.
import {
  PROTOCOL_VERSION,
  workerCommandSchema,
  type WorkerErrorCode,
  type WorkerEvent
} from "../../../../packages/schema/src/index";
import initPhysics, * as core from "../../../../crates/physics-core/pkg/physics_core.js";

import { createWorkerRuntime, type WasmExports, type WorkerRuntime } from "./physics.worker";

const scope = self as unknown as DedicatedWorkerGlobalScope;
let runtime: Promise<WorkerRuntime> | null = null;

const loadRuntime = (): Promise<WorkerRuntime> => {
  runtime ??= initPhysics().then(() => createWorkerRuntime(core as unknown as WasmExports));
  runtime.catch(() => {
    runtime = null;
  });
  return runtime;
};

const post = (event: WorkerEvent): void => {
  const transfer = event.type === "result" ? [event.frameBuffer, event.telemetryBuffer] : [];
  scope.postMessage(event, transfer);
};

const fail = (requestId: string, code: WorkerErrorCode, message: string): void =>
  post({
    protocolVersion: PROTOCOL_VERSION,
    type: "error",
    requestId,
    runId: null,
    code,
    message,
    details: {},
    recoverable: code !== "core-init-failed"
  });

const requestIdOf = (data: unknown): string | null => {
  const requestId = (data as { requestId?: unknown } | null)?.requestId;
  return typeof requestId === "string" ? requestId : null;
};

scope.onmessage = async (message: MessageEvent<unknown>) => {
  const parsed = workerCommandSchema.safeParse(message.data);
  if (!parsed.success) {
    const requestId = requestIdOf(message.data);
    if (requestId) {
      fail(
        requestId,
        "invalid-scenario",
        parsed.error.issues.map((issue) => issue.message).join("; ")
      );
    }
    return;
  }

  try {
    const loaded = await loadRuntime();
    for (const event of loaded.handleCommand(parsed.data)) {
      post(event);
    }
  } catch (error) {
    fail(
      parsed.data.requestId,
      "core-init-failed",
      error instanceof Error ? error.message : String(error)
    );
  }
};
