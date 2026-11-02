import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

import type {
  CanonicalBikeGeometry,
  Point2,
  PoseKeyValidation,
  PoseSample,
  Scenario
} from "../../../../../packages/schema/src/index";
import { Button } from "../../components/ui";
import { drawPoseStage, poseStageViewport } from "../../rendering/canvas/pose-stage";
import { registerPoseHandleTestControls } from "../../test-hooks";
import { handleTargetFromPoint, pickPoseHandle, poseHandles } from "./pose-handles";
import type { PoseFeasibleLimits } from "./pose-limits";
import type { JointName } from "./pose-sampling";

type DesignerStageProps = {
  scenario: Scenario;
  selectedS: number;
  selectedLabel: string;
  selectedTargets: { knee: number; hip: number; spine: number };
  sample: PoseSample | null;
  feasibleLimits: PoseFeasibleLimits | null;
  envelopeLimits: PoseFeasibleLimits | null;
  saturated: boolean;
  saturationReason: string | null;
  validation: PoseKeyValidation | null;
  canonicalGeometry: CanonicalBikeGeometry | null;
  mode: "bike" | "pose";
  onResetPose: () => void;
  onJointDrag: (joint: JointName, value: number) => void;
};

const toDegrees = (radians: number): string => `${((radians * 180) / Math.PI).toFixed(1)} deg`;

/** How long limit arcs linger after the pose stops changing. */
const ARC_LINGER_MS = 2500;

export const DesignerStage = ({
  scenario,
  selectedS,
  selectedLabel,
  selectedTargets,
  sample,
  feasibleLimits,
  envelopeLimits,
  saturated,
  saturationReason,
  validation,
  canonicalGeometry,
  mode,
  onResetPose,
  onJointDrag
}: DesignerStageProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hovered, setHovered] = useState<JointName | null>(null);
  const [active, setActive] = useState<JointName | null>(null);
  const [recentlyAdjusted, setRecentlyAdjusted] = useState(false);
  const settledOnce = useRef(false);

  useEffect(() => {
    // Arcs are guidance for an edit, so the opening pose stays uncluttered.
    if (!settledOnce.current) {
      settledOnce.current = true;
      return;
    }

    setRecentlyAdjusted(true);
    const timer = setTimeout(() => setRecentlyAdjusted(false), ARC_LINGER_MS);
    return () => clearTimeout(timer);
  }, [selectedTargets]);

  const showLimits = recentlyAdjusted || active !== null || hovered !== null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    try {
      drawPoseStage(
        canvas,
        scenario,
        sample,
        saturated,
        { hovered, active, showLimits },
        feasibleLimits,
        envelopeLimits,
        canonicalGeometry,
        mode
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("Canvas 2D context")) {
        return;
      }
      throw error;
    }
  }, [
    active,
    canonicalGeometry,
    feasibleLimits,
    hovered,
    mode,
    sample,
    saturated,
    scenario,
    selectedTargets,
    showLimits
  ]);

  useEffect(
    () =>
      registerPoseHandleTestControls(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
          return [];
        }
        const viewport = poseStageViewport(canvas);
        return poseHandles(sample).map((handle) => {
          const [x, y] = viewport.worldToCss(handle.point.x, handle.point.y);
          return { joint: handle.joint, x, y };
        });
      }),
    [sample]
  );

  const worldPoint = (clientX: number, clientY: number): Point2 | null => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    const [x, y] = poseStageViewport(canvas).cssToWorld(clientX - rect.left, clientY - rect.top);
    return { x, y };
  };

  const dragTo = (joint: JointName, clientX: number, clientY: number) => {
    const point = worldPoint(clientX, clientY);
    const handle = poseHandles(sample).find((candidate) => candidate.joint === joint);
    if (!point || !handle) {
      return;
    }
    onJointDrag(joint, handleTargetFromPoint(handle, point));
  };

  return (
    <>
      <div className="stagebar" data-od-id="pose-overlay-bar">
        <span className="stagebar-title">{mode === "bike" ? "Bike preview" : "Pose preview"}</span>
        <span className="spacer" />
        {mode === "pose" ? (
          <Button
            id="reset-pose"
            data-od-id="reset-pose"
            icon={<RotateCcw aria-hidden="true" />}
            onClick={onResetPose}
          >
            Reset pose
          </Button>
        ) : null}
      </div>

      <div data-od-id="designer-canvas">
        <div className="stage pose-stage" data-od-id="pose-canvas">
          <canvas
            ref={canvasRef}
            aria-label="Bike and rider Designer preview"
            style={{ cursor: active ? "grabbing" : hovered ? "grab" : "default" }}
            onPointerDown={(event) => {
              const point = worldPoint(event.clientX, event.clientY);
              const handle = point ? pickPoseHandle(poseHandles(sample), point) : null;
              if (!handle) {
                return;
              }
              event.currentTarget.setPointerCapture(event.pointerId);
              setActive(handle.joint);
              setHovered(handle.joint);
              dragTo(handle.joint, event.clientX, event.clientY);
            }}
            onPointerMove={(event) => {
              if (active) {
                dragTo(active, event.clientX, event.clientY);
                return;
              }
              const point = worldPoint(event.clientX, event.clientY);
              const handle = point ? pickPoseHandle(poseHandles(sample), point) : null;
              setHovered(handle?.joint ?? null);
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              setActive(null);
            }}
            onPointerCancel={() => setActive(null)}
            onPointerLeave={() => {
              if (!active) {
                setHovered(null);
              }
            }}
          />

          <p className="sr-only" aria-live="polite">
            Pose sample at {selectedS.toFixed(2)} metres. Target knee{" "}
            {toDegrees(selectedTargets.knee)}, hip {toDegrees(selectedTargets.hip)}, spine{" "}
            {toDegrees(selectedTargets.spine)}. Calculated elbow{" "}
            {toDegrees(sample?.derivedArm.elbow ?? 0)}.{" "}
            {saturated ? "Constrained to finite reachable limits." : "Within requested limits."}{" "}
            Bike fit is shown schematically; wheels and rider contacts are measured.
          </p>

          <div className="stage-badge top-left">
            s = {selectedS.toFixed(2)} m · <strong>{selectedLabel}</strong>
          </div>
          <div className="stage-badge top-right">
            {validation && !validation.valid
              ? "clearance blocked"
              : validation?.contacts.some((contact) => contact.active)
                ? "contact valid"
                : saturated
                  ? "constrained"
                  : "clearance valid"}
          </div>
          <div className="pose-hint" data-od-id="canvas-hint">
            {mode === "bike"
              ? null
              : `Drag the knee, hip, or shoulder handle to pose the rider. ${saturationReason ?? "Handles stop at each joint's limit arc."}`}
          </div>
        </div>
      </div>
    </>
  );
};
