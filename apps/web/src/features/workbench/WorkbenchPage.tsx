import { useEffect } from "react";
import { Play, RotateCcw, Square } from "lucide-react";
import { Link } from "react-router";

import type { AchievedPoseLandmarks } from "../../../../../packages/schema/src/index";
import { AppShell, Button, Callout, ChipSet, SegmentedControl } from "../../components/ui";
import {
  registerPlaybackTestControls,
  registerWorkbenchGeometryTestControls
} from "../../test-hooks";
import { InputRail } from "./InputRail";
import { MetricsRail } from "./MetricsRail";
import { Transport } from "./Transport";
import { interpolateFrameField, usePlayback } from "./usePlayback";
import { useWorkbench } from "./useWorkbench";
import { WorkbenchStage } from "./WorkbenchStage";
import { nearestTerrainSegment, terrainHeightAt } from "../../rendering/canvas/terrain-profile";

const readScalar = (
  readField: ((frameIndex: number, fieldName: string) => Float32Array) | null,
  frameIndex: number,
  field: string,
  fallback: number
): number => readField?.(frameIndex, field)[0] ?? fallback;

/** Keeps a fractional frame position inside a buffer, so a shorter run can never be over-read. */
const clampPosition = (position: number, frameCount: number): number =>
  Math.min(Math.max(Number.isFinite(position) ? position : 0, 0), Math.max(frameCount - 1, 0));

const readInterpolatedScalar = (
  frameView: Parameters<typeof interpolateFrameField>[0] | null,
  framePosition: number,
  field: string,
  fallback: number
): number =>
  frameView && frameView.hasField(field)
    ? (interpolateFrameField(frameView, field, framePosition)[0] ?? fallback)
    : fallback;

const readInterpolatedAngle = (
  frameView: Parameters<typeof interpolateFrameField>[0] | null,
  framePosition: number,
  field: string,
  fallback: number
): number => {
  if (!frameView?.hasField(field)) return fallback;
  const position = clampPosition(framePosition, frameView.frameCount);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.min(frameView.frameCount - 1, Math.ceil(position));
  const lower = frameView.readField(lowerIndex, field)[0] ?? fallback;
  const upper = frameView.readField(upperIndex, field)[0] ?? lower;
  const delta = Math.atan2(Math.sin(upper - lower), Math.cos(upper - lower));
  return lower + delta * (position - lowerIndex);
};

const landmarkFieldNames = [
  "pedalContact",
  "ankle",
  "knee",
  "hip",
  "shoulder",
  "elbow",
  "hand",
  "handlebarContact",
  "head"
] as const;

/**
 * Reads the complete achieved landmark set from a frame view. Returns null
 * when the layout predates this feature (FR-022): Workbench must not invent
 * a posture for those legacy runs.
 */
const readLandmarks = (
  frameView:
    | {
        readField: (frameIndex: number, fieldName: string) => Float32Array;
        hasField: (name: string) => boolean;
      }
    | null
    | undefined,
  frameIndex: number
): AchievedPoseLandmarks | undefined => {
  if (!frameView || !frameView.hasField("pedalContactX")) {
    return undefined;
  }

  const landmarks = {} as AchievedPoseLandmarks;
  for (const name of landmarkFieldNames) {
    landmarks[name] = {
      x: frameView.readField(frameIndex, `${name}X`)[0] ?? 0,
      y: frameView.readField(frameIndex, `${name}Y`)[0] ?? 0
    };
  }
  return landmarks;
};

const readInterpolatedLandmarks = (
  frameView: Parameters<typeof interpolateFrameField>[0] | null,
  framePosition: number
): AchievedPoseLandmarks | undefined => {
  if (!frameView?.hasField("pedalContactX")) return undefined;
  const landmarks = {} as AchievedPoseLandmarks;
  for (const name of landmarkFieldNames) {
    landmarks[name] = {
      x: interpolateFrameField(frameView, `${name}X`, framePosition)[0] ?? 0,
      y: interpolateFrameField(frameView, `${name}Y`, framePosition)[0] ?? 0
    };
  }
  return landmarks;
};

export const WorkbenchPage = () => {
  const workbench = useWorkbench();
  const frameCount = workbench.frameView?.frameCount ?? 1;
  const outputHz = workbench.run?.outputHz ?? workbench.scenario?.solver.outputHz ?? 120;
  const playback = usePlayback(
    frameCount,
    outputHz,
    workbench.playbackRate,
    workbench.setPlaybackRate
  );

  useEffect(() => registerPlaybackTestControls(playback.setFrameIndex), [playback.setFrameIndex]);

  const frameView = workbench.frameView ?? null;
  useEffect(
    () =>
      registerWorkbenchGeometryTestControls(() => {
        if (!frameView) {
          return {
            targets: null,
            derivedArm: null,
            landmarks: null,
            groundedRear: null,
            groundedFront: null,
            minClearance: null,
            nearestTerrainSegment: null,
            touchdownFrame: workbench.touchdownFrame,
            touchdownIndicatorVisible: false
          };
        }
        const safeIndex = Math.min(playback.frameIndex, frameView.frameCount - 1);
        const landmarks = readLandmarks(frameView, safeIndex) ?? null;
        const targets = frameView.hasField("knee")
          ? {
              knee: frameView.readField(safeIndex, "knee")[0] ?? 0,
              hip: frameView.readField(safeIndex, "hip")[0] ?? 0,
              spine: frameView.readField(safeIndex, "spine")[0] ?? 0
            }
          : null;
        const derivedArm = frameView.hasField("shoulder")
          ? {
              shoulder: frameView.readField(safeIndex, "shoulder")[0] ?? 0,
              elbow: frameView.readField(safeIndex, "elbow")[0] ?? 0,
              constrained: false
            }
          : null;
        const contact =
          frameView.hasField("groundedRear") && frameView.hasField("groundedFront")
            ? frameView.readContactState(safeIndex)
            : null;
        const framePoint = {
          x: readScalar(frameView.readField, safeIndex, "x", 0),
          y: readScalar(frameView.readField, safeIndex, "y", 0)
        };
        return {
          targets,
          derivedArm,
          landmarks,
          groundedRear: contact?.groundedRear ?? null,
          groundedFront: contact?.groundedFront ?? null,
          minClearance: contact?.minClearance ?? null,
          nearestTerrainSegment: nearestTerrainSegment(workbench.terrain.profile, framePoint),
          touchdownFrame: workbench.touchdownFrame,
          touchdownIndicatorVisible:
            workbench.touchdownFrame !== null && playback.frameIndex === workbench.touchdownFrame
        };
      }),
    [frameView, playback.frameIndex, workbench.terrain.profile, workbench.touchdownFrame]
  );

  if (!workbench.scenario) {
    return (
      <AppShell
        scenarioLabel="Standard jump"
        status="loading"
        source="solver"
        primaryLabel="Solve run"
        primaryId="run-solve"
        primaryIcon={<Play aria-hidden="true" />}
        primaryDisabled
        onPrimary={() => undefined}
      >
        <main className="placeholder-page" data-od-id="workbench-page">
          <Callout title="Preparing workbench" tone="info">
            Initializing solver capabilities and scenario snapshot.
          </Callout>
        </main>
      </AppShell>
    );
  }

  // The run can change length under the playhead (re-solve); clamp before reading.
  const framePosition = clampPosition(playback.framePosition, frameCount);
  const frameIndex = Math.round(framePosition);
  const contact =
    workbench.frameView?.hasField("groundedRear") && workbench.frameView.hasField("groundedFront")
      ? workbench.frameView.readContactState(frameIndex)
      : null;
  // Compare against the baseline at the same time, not the same frame index: runs may use
  // different output rates and lengths.
  const baselineHz = workbench.baselineArtifact?.manifest.outputHz ?? outputHz;
  const baselinePosition = workbench.baselineFrameView
    ? clampPosition((framePosition / outputHz) * baselineHz, workbench.baselineFrameView.frameCount)
    : 0;
  const restingY = terrainHeightAt(workbench.terrain.profile, workbench.scenario.entry.startX) ?? 0;
  const frame = {
    x: readInterpolatedScalar(
      workbench.frameView,
      framePosition,
      "x",
      workbench.scenario.entry.startX
    ),
    y: readInterpolatedScalar(workbench.frameView, framePosition, "y", restingY),
    pitch: readInterpolatedAngle(workbench.frameView, framePosition, "pitch", 0),
    vx: readInterpolatedScalar(workbench.frameView, framePosition, "vx", 0),
    vy: readInterpolatedScalar(workbench.frameView, framePosition, "vy", 0),
    ...(workbench.frameView?.hasField("riderX")
      ? {
          riderX: readInterpolatedScalar(workbench.frameView, framePosition, "riderX", 0),
          riderY: readInterpolatedScalar(workbench.frameView, framePosition, "riderY", 0),
          actuatorForceX: readInterpolatedScalar(
            workbench.frameView,
            framePosition,
            "actuatorForceX",
            0
          ),
          actuatorForceY: readInterpolatedScalar(
            workbench.frameView,
            framePosition,
            "actuatorForceY",
            0
          ),
          actuatorTorque: readInterpolatedScalar(
            workbench.frameView,
            framePosition,
            "actuatorTorque",
            0
          )
        }
      : {}),
    crashed:
      (workbench.frameView?.hasField("crashed")
        ? workbench.frameView.readField(frameIndex, "crashed")[0]
        : 0) === 1,
    groundedRear: contact?.groundedRear,
    groundedFront: contact?.groundedFront,
    normalForceRear: contact?.normalForceRear,
    normalForceFront: contact?.normalForceFront,
    minClearance: contact?.minClearance,
    landmarks: readInterpolatedLandmarks(workbench.frameView, framePosition)
  };

  const baselineFrame = workbench.baselineFrameView
    ? {
        x: readInterpolatedScalar(
          workbench.baselineFrameView,
          baselinePosition,
          "x",
          workbench.scenario.entry.startX
        ),
        y: readInterpolatedScalar(workbench.baselineFrameView, baselinePosition, "y", restingY),
        pitch: readInterpolatedAngle(workbench.baselineFrameView, baselinePosition, "pitch", 0)
      }
    : null;

  return (
    <AppShell
      scenarioLabel={workbench.scenario.name}
      status={workbench.statusLabel}
      source={workbench.currentArtifact?.source ?? "solver"}
      primaryLabel={workbench.solver.lifecycle === "solving" ? "Cancel solve" : "Solve run"}
      primaryId="run-solve"
      primaryIcon={
        workbench.solver.lifecycle === "solving" ? (
          <Square aria-hidden="true" />
        ) : (
          <Play aria-hidden="true" />
        )
      }
      onPrimary={() => void workbench.solve()}
    >
      <div className="workbench-grid">
        <InputRail
          scenario={workbench.scenario}
          onJumpKindChange={workbench.setJumpKind}
          onControlChange={workbench.updateControl}
          supportedPaths={workbench.supportedPaths}
        />

        <main className="stage-column" data-od-id="stage-column">
          <div className="stagebar" data-od-id="overlay-bar">
            <Link className="btn" to="/designer">
              Open Designer
            </Link>
            <div data-od-id="overlay-chips">
              <ChipSet
                label="Stage overlays"
                values={workbench.overlays}
                options={[
                  { value: "trajectory", label: "Trajectory" },
                  { value: "rider", label: "Rider" },
                  { value: "com", label: "COM" },
                  { value: "velocity", label: "Velocity" },
                  { value: "force", label: "Force" },
                  { value: "torque", label: "Torque" },
                  { value: "suspension", label: "Suspension" },
                  { value: "baseline", label: "Baseline" }
                ]}
                onChange={workbench.setOverlays}
              />
            </div>
            <span className="spacer" />
            <div data-od-id="camera-mode">
              <SegmentedControl
                label="Camera mode"
                value={workbench.cameraMode}
                options={[
                  { value: "follow", label: "Follow" },
                  { value: "jump", label: "Jump" },
                  { value: "pan-zoom", label: "Pan & Zoom" }
                ]}
                onChange={workbench.setCameraMode}
              />
            </div>
            <label className="camera-zoom-control">
              <span>Zoom</span>
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.05"
                value={workbench.cameraZoomFactor}
                aria-label="Camera zoom"
                onChange={(event) => workbench.setCameraZoom(event.currentTarget.valueAsNumber)}
              />
              <output>{workbench.cameraZoomFactor.toFixed(2)}x</output>
            </label>
            <Button
              id="camera-reset"
              data-od-id="camera-reset"
              icon={<RotateCcw aria-hidden="true" />}
              title="Reset view"
              onClick={workbench.resetCamera}
            >
              Reset view
            </Button>
          </div>

          <WorkbenchStage
            scenario={workbench.scenario}
            frame={frame}
            baselineFrame={baselineFrame}
            frameIndex={frameIndex}
            run={workbench.frameView ? workbench.run : null}
            terrainProfile={workbench.terrain.profile}
            terrainState={workbench.terrain.state}
            touchdownFrame={workbench.touchdownFrame}
            overlays={workbench.overlays}
            trajectory={workbench.trajectory}
            camera={{
              mode: workbench.cameraMode,
              zoomFactor: workbench.cameraZoomFactor,
              manual: workbench.manualCamera
            }}
            onManualCameraChange={workbench.setManualCamera}
          />

          <Transport
            playback={playback}
            frameCount={frameCount}
            outputHz={outputHz}
            disabled={!workbench.frameView}
            baselinePinned={workbench.baselinePinned}
            onToggleBaseline={workbench.toggleBaseline}
          />

          {workbench.resultState === "stale" ? (
            <Callout title="Result is out of date" tone="warning">
              The scenario changed after this run was solved. Solve again to see the current jump.
            </Callout>
          ) : null}

          <Callout title="What the model covers" tone="info">
            The rider&apos;s authored body position moves the bike through internal forces at the
            pedals and grips, so pumping, popping, and in-air rotation come from the pose. Tires are
            frictionless, and suspension and air drag are not simulated.
          </Callout>

          {workbench.terrain.state === "error" ? (
            <Callout title="Terrain unavailable" tone="warning">
              {workbench.terrain.reason}
            </Callout>
          ) : null}

          {workbench.regeneration.state === "regenerated" ? (
            <Callout title="Run regenerated" tone="info">
              This saved run was regenerated for the current solver.
            </Callout>
          ) : null}
          {workbench.regeneration.state === "regenerating" ? (
            <div className="solve-progress" role="status">
              <span>Regenerating saved run</span>
              <progress />
            </div>
          ) : null}
          {workbench.regeneration.state === "unavailable" ? (
            <Callout title="Run unavailable" tone="warning">
              {workbench.regeneration.reason}
            </Callout>
          ) : null}
          {workbench.regeneration.state === "failed" ? (
            <Callout title="Regeneration failed" tone="warning">
              {workbench.regeneration.reason}
            </Callout>
          ) : null}

          {workbench.surfaceError ? (
            <Callout title="Solve failed" tone="warning">
              {workbench.surfaceError}
            </Callout>
          ) : null}
          {workbench.initError ? (
            <Callout title="Core unavailable" tone="warning">
              {workbench.initError}
            </Callout>
          ) : null}
          {workbench.solver.lifecycle === "solving" ? (
            <div className="solve-progress" role="status">
              <span>{workbench.solver.progressLabel || "Solving"}</span>
              <progress value={workbench.solver.progressFraction} max={1} />
            </div>
          ) : null}
        </main>

        <MetricsRail
          run={workbench.run}
          baselineSelection={workbench.baselineSelection}
          baselineArtifact={workbench.baselineArtifact}
        />
      </div>
    </AppShell>
  );
};
