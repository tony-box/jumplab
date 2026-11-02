import { useRef } from "react";

import type { PoseClip } from "../../../../../packages/schema/src/index";

import { buildChannelCurves } from "./pose-interpolation";
import type { JointName } from "./pose-sampling";

type DistanceTrackProps = {
  keyframes: Array<{ id: string; s: number; label: string; targets: Record<JointName, number> }>;
  selectedKeyId: string | null;
  interpolation: PoseClip["interpolation"];
  onSelectKey: (keyId: string) => void;
  onMoveKey: (keyId: string, s: number) => void;
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const CHANNEL_JOINTS: JointName[] = ["hip", "spine"];

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 100;

const INTERPOLATION_HINT: Record<PoseClip["interpolation"], string> = {
  cubic: "cubic Hermite: smooth, overshoots between keys",
  linear: "linear: constant rate between keys",
  step: "step: target holds, then jumps at each key"
};

export const DistanceTrack = ({
  keyframes,
  selectedKeyId,
  interpolation,
  onSelectKey,
  onMoveKey
}: DistanceTrackProps) => {
  const barRef = useRef<HTMLDivElement | null>(null);

  const first = keyframes[0]?.s ?? -1;
  const last = keyframes[keyframes.length - 1]?.s ?? 1;
  const span = Math.max(0.001, last - first);

  const curves = buildChannelCurves(
    keyframes,
    interpolation,
    CHANNEL_JOINTS,
    VIEW_WIDTH,
    VIEW_HEIGHT
  );
  const lipPercent = ((0 - first) / span) * 100;

  const pointerToS = (clientX: number): number => {
    const bar = barRef.current;
    if (!bar) {
      return first;
    }
    const rect = bar.getBoundingClientRect();
    const x = clamp(clientX - rect.left, 0, rect.width);
    const fraction = rect.width <= 0 ? 0 : x / rect.width;
    return first + span * fraction;
  };

  const nearestKeyId = (s: number): string | null => {
    let nearest: { id: string; delta: number } | null = null;
    for (const key of keyframes) {
      const delta = Math.abs(key.s - s);
      if (!nearest || delta < nearest.delta) {
        nearest = { id: key.id, delta };
      }
    }
    return nearest?.id ?? null;
  };

  return (
    <section className="distance-track" data-od-id="distance-track">
      <div className="distance-heading">
        <strong>Along-track distance</strong>
        <span>hip &amp; spine target channels</span>
      </div>

      <div
        ref={barRef}
        className="distance-bar"
        onClick={(event) => {
          const s = pointerToS(event.clientX);
          const nearest = nearestKeyId(s);
          if (nearest) {
            onSelectKey(nearest);
          }
        }}
      >
        <svg
          className="channel-curves"
          data-od-id="channel-curves"
          data-interpolation={interpolation}
          viewBox={`0 0 ${String(VIEW_WIDTH)} ${String(VIEW_HEIGHT)}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {curves.map((curve) => (
            <path
              key={curve.joint}
              className={`channel-${curve.joint}`}
              data-od-id={`channel-curve-${curve.joint}`}
              d={curve.path}
            />
          ))}
        </svg>
        {lipPercent >= 0 && lipPercent <= 100 ? (
          <i className="lip-line" style={{ left: `${String(lipPercent)}%` }} />
        ) : null}
        {keyframes.map((key) => {
          const left = ((key.s - first) / span) * 100;
          return (
            <button
              key={key.id}
              type="button"
              className={key.id === selectedKeyId ? "selected" : ""}
              style={{ left: `${left}%` }}
              aria-label={`Select ${key.label} at ${key.s.toFixed(2)} metres`}
              onClick={(event) => {
                event.stopPropagation();
                onSelectKey(key.id);
              }}
              onPointerDown={(event) => {
                event.preventDefault();
                onSelectKey(key.id);

                const move = (moveEvent: PointerEvent) => {
                  onMoveKey(key.id, pointerToS(moveEvent.clientX));
                };

                const stop = () => {
                  window.removeEventListener("pointermove", move);
                  window.removeEventListener("pointerup", stop);
                };

                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", stop);
              }}
            />
          );
        })}
      </div>

      <p className="distance-legend" data-od-id="channel-legend">
        <span className="channel-swatch channel-hip" />
        hip
        <span className="channel-swatch channel-spine" />
        spine
        <em>{INTERPOLATION_HINT[interpolation]}</em>
      </p>
    </section>
  );
};
