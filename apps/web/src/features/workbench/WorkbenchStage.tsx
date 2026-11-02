import { useEffect, useRef, useState } from "react";
import type {
  BikeGeometryInspection,
  RunResult,
  Scenario,
  TerrainProfile
} from "../../../../../packages/schema/src/index";

import { useAppServices } from "../../app/AppProviders";
import { useCanvasResize } from "../../rendering/canvas/useCanvasResize";
import { drawWorkbenchStage, type WorkbenchFrame } from "../../rendering/canvas/workbench-stage";
import {
  clampZoomFactor,
  interpolateWorldBounds,
  viewCenter,
  type CameraResolution,
  type CameraViewState,
  type ManualCameraState
} from "../../rendering/canvas/camera";
import { registerCameraTestControls } from "../../test-hooks";

type WorkbenchStageProps = {
  scenario: Scenario;
  frame: WorkbenchFrame;
  baselineFrame: WorkbenchFrame | null;
  frameIndex: number;
  run: RunResult | null;
  terrainProfile: TerrainProfile | null;
  terrainState: "idle" | "loading" | "ready" | "error";
  touchdownFrame: number | null;
  overlays: string[];
  camera: CameraViewState;
  trajectory: readonly { x: number; y: number }[];
  onManualCameraChange: (manual: ManualCameraState) => void;
};

export const WorkbenchStage = ({
  scenario,
  frame,
  baselineFrame,
  frameIndex,
  run,
  terrainProfile,
  terrainState,
  touchdownFrame,
  overlays,
  camera,
  trajectory,
  onManualCameraChange
}: WorkbenchStageProps) => {
  const services = useAppServices();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resolutionRef = useRef<CameraResolution | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistanceRef = useRef<number | null>(null);
  const [canonicalGeometry, setCanonicalGeometry] = useState<BikeGeometryInspection | null>(null);
  const geometryRequestRef = useRef(0);
  const resizeTick = useCanvasResize(canvasRef);

  useEffect(() => {
    const requestId = ++geometryRequestRef.current;
    void services.solverGateway
      .inspectBikeGeometry(scenario.bike)
      .then((geometry) => {
        if (requestId === geometryRequestRef.current) setCanonicalGeometry(geometry);
      })
      .catch(() => {
        // Keep the latest successful geometry visible during transient gateway errors.
      });
  }, [scenario.bike, services.solverGateway]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canonicalGeometry) {
      return;
    }

    const render = (viewOverride?: CameraResolution["view"]) => {
      try {
        return drawWorkbenchStage(canvas, {
          scenario,
          frame,
          baselineFrame,
          frameIndex,
          terrainProfile,
          touchdownFrame,
          overlays,
          camera,
          canonicalGeometry,
          trajectory,
          viewOverride
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("Canvas 2D context")) {
          return null;
        }
        throw error;
      }
    };

    const previous = resolutionRef.current;
    const target = render();
    if (!target) return;

    let animationFrame = 0;
    const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const changed = previous
      ? Object.keys(target.view).some(
          (key) =>
            Math.abs(
              target.view[key as keyof typeof target.view] -
                previous.view[key as keyof typeof previous.view]
            ) > 1e-6
        )
      : false;

    if (camera.mode === "jump" && previous && changed && !reducedMotion) {
      const startedAt = performance.now();
      resolutionRef.current = render(previous.view) ?? target;
      const animate = (timestamp: number) => {
        const progress = Math.min(1, (timestamp - startedAt) / 160);
        const eased = 1 - (1 - progress) ** 3;
        const view = interpolateWorldBounds(previous.view, target.view, eased);
        resolutionRef.current = render(view) ?? target;
        if (progress < 1) animationFrame = requestAnimationFrame(animate);
      };
      animationFrame = requestAnimationFrame(animate);
    } else {
      resolutionRef.current = target;
    }

    if (camera.mode === "pan-zoom" && !camera.manual) {
      const center = viewCenter(target.view);
      onManualCameraChange({
        centerX: center.x,
        centerY: center.y,
        zoomFactor: camera.zoomFactor,
        baseWidth: (target.view.maxX - target.view.minX) * camera.zoomFactor,
        baseHeight: (target.view.maxY - target.view.minY) * camera.zoomFactor
      });
    }

    return () => cancelAnimationFrame(animationFrame);
  }, [
    baselineFrame,
    camera,
    canonicalGeometry,
    frame,
    frameIndex,
    onManualCameraChange,
    overlays,
    resizeTick,
    run,
    scenario,
    terrainProfile,
    touchdownFrame,
    trajectory
  ]);

  useEffect(
    () =>
      registerCameraTestControls(() => ({
        ...(resolutionRef.current ?? {
          view: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
          zoomFactor: 1,
          modelHeightFraction: 0
        }),
        mode: camera.mode
      })),
    [camera.mode]
  );

  const updateManual = (centerX: number, centerY: number, zoomFactor: number) => {
    const resolution = resolutionRef.current;
    onManualCameraChange({
      centerX,
      centerY,
      zoomFactor: clampZoomFactor(zoomFactor),
      baseWidth: resolution
        ? (resolution.view.maxX - resolution.view.minX) * resolution.zoomFactor
        : undefined,
      baseHeight: resolution
        ? (resolution.view.maxY - resolution.view.minY) * resolution.zoomFactor
        : undefined
    });
  };

  const panByPixels = (deltaX: number, deltaY: number) => {
    const canvas = canvasRef.current;
    const resolution = resolutionRef.current;
    if (!canvas || !resolution) return;
    const rect = canvas.getBoundingClientRect();
    const center = viewCenter(resolution.view);
    updateManual(
      center.x - (deltaX / Math.max(1, rect.width)) * (resolution.view.maxX - resolution.view.minX),
      center.y +
        (deltaY / Math.max(1, rect.height)) * (resolution.view.maxY - resolution.view.minY),
      resolution.zoomFactor
    );
  };

  const zoomAt = (factor: number, clientX?: number, clientY?: number) => {
    const canvas = canvasRef.current;
    const resolution = resolutionRef.current;
    if (!canvas || !resolution) return;
    const rect = canvas.getBoundingClientRect();
    const width = resolution.view.maxX - resolution.view.minX;
    const height = resolution.view.maxY - resolution.view.minY;
    const fractionX = clientX === undefined ? 0.5 : (clientX - rect.left) / Math.max(1, rect.width);
    const fractionY = clientY === undefined ? 0.5 : (clientY - rect.top) / Math.max(1, rect.height);
    const anchorX = resolution.view.minX + fractionX * width;
    const anchorY = resolution.view.maxY - fractionY * height;
    const nextZoom = clampZoomFactor(resolution.zoomFactor * factor);
    const ratio = resolution.zoomFactor / nextZoom;
    const nextWidth = width * ratio;
    const nextHeight = height * ratio;
    updateManual(
      anchorX + (0.5 - fractionX) * nextWidth,
      anchorY + (fractionY - 0.5) * nextHeight,
      nextZoom
    );
  };

  const zoomAtRef = useRef(zoomAt);
  zoomAtRef.current = zoomAt;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // React registers wheel handlers as passive, which ignores preventDefault and scrolls the page.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAtRef.current(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX, event.clientY);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  const phase = !run
    ? "no run"
    : frame.crashed
      ? "crashed"
      : (run.phases.find((item) => frameIndex >= item.startFrame && frameIndex <= item.endFrame)
          ?.name ?? "ready");
  const contactForce =
    frame.normalForceRear === undefined || frame.normalForceFront === undefined
      ? null
      : frame.normalForceRear + frame.normalForceFront;

  return (
    <div
      className="stage"
      data-od-id="sim-canvas"
      tabIndex={0}
      aria-label="Interactive jump simulation stage"
      onKeyDown={(event) => {
        const steps: Record<string, [number, number]> = {
          ArrowLeft: [36, 0],
          ArrowRight: [-36, 0],
          ArrowUp: [0, 36],
          ArrowDown: [0, -36]
        };
        const step = steps[event.key];
        if (step) {
          event.preventDefault();
          panByPixels(...step);
        } else if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          zoomAt(1.2);
        } else if (event.key === "-" || event.key === "_") {
          event.preventDefault();
          zoomAt(1 / 1.2);
        }
      }}
    >
      <canvas
        ref={canvasRef}
        aria-label="Jump simulation stage"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        }}
        onPointerMove={(event) => {
          const previous = pointersRef.current.get(event.pointerId);
          if (!previous) return;
          pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          const pointers = [...pointersRef.current.values()];
          if (pointers.length === 1) {
            panByPixels(event.clientX - previous.x, event.clientY - previous.y);
            return;
          }
          const [first, second] = pointers;
          if (!first || !second) return;
          const distance = Math.hypot(second.x - first.x, second.y - first.y);
          const previousDistance = pinchDistanceRef.current;
          if (previousDistance && previousDistance > 0) {
            zoomAt(distance / previousDistance, (first.x + second.x) / 2, (first.y + second.y) / 2);
          }
          pinchDistanceRef.current = distance;
        }}
        onPointerUp={(event) => {
          pointersRef.current.delete(event.pointerId);
          pinchDistanceRef.current = null;
        }}
        onPointerCancel={(event) => {
          pointersRef.current.delete(event.pointerId);
          pinchDistanceRef.current = null;
        }}
      />
      <p className="sr-only" aria-live="polite">
        Frame {frameIndex}: bike at {frame.x.toFixed(2)} metres horizontal and {frame.y.toFixed(2)}{" "}
        metres high, pitch {((frame.pitch * 180) / Math.PI).toFixed(1)} degrees. Phase {phase}.{" "}
        {!run
          ? "No run has been solved yet."
          : frame.landmarks
            ? "Rider posture is available for this frame."
            : "Rider posture is unavailable for this legacy run."}
      </p>
      <div
        className="stage-badge top-left"
        data-od-id="contact-readout"
        data-touchdown-visible={
          touchdownFrame !== null && frameIndex === touchdownFrame ? "true" : "false"
        }
      >
        {phase} · <strong>frame {frameIndex}</strong>
        {contactForce === null ? "" : ` · contact ${contactForce.toFixed(0)} N`}
      </div>
      <div className="stage-badge top-right" data-od-id="terrain-status">
        terrain {terrainState} · camera {camera.mode}
      </div>
      <div className="stage-badge bottom-left" data-od-id="stage-legend">
        overlays: {overlays.length > 0 ? overlays.join(", ") : "none"}
      </div>
    </div>
  );
};
