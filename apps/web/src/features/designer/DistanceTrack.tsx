import { Pause, Play } from "lucide-react";
import { useEffect, useRef } from "react";

import type { PoseClip } from "../../../../../packages/schema/src/index";

import { Button } from "../../components/ui";
import { buildChannelCurves } from "./pose-interpolation";
import type { JointName } from "./pose-sampling";
import type { JumpMarker } from "./useJumpMarkers";
import { PREVIEW_RATES, type PosePreview, type PreviewRate } from "./usePosePreview";

type DistanceTrackProps = {
  keyframes: Array<{ id: string; s: number; label: string; targets: Record<JointName, number> }>;
  selectedKeyId: string | null;
  interpolation: PoseClip["interpolation"];
  onSelectKey: (keyId: string) => void;
  onMoveKey: (keyId: string, s: number) => void;
  preview?: PosePreview;
  markers?: JumpMarker[];
  /** Distance range across the strip; defaults to the keys. */
  domain?: { start: number; end: number };
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
  onMoveKey,
  preview,
  markers = [],
  domain
}: DistanceTrackProps) => {
  const barRef = useRef<HTMLDivElement | null>(null);
  const stopDragRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopDragRef.current?.(), []);

  const first = domain?.start ?? keyframes[0]?.s ?? -1;
  const last = domain?.end ?? keyframes[keyframes.length - 1]?.s ?? 1;
  const span = Math.max(0.001, last - first);
  const percentAt = (s: number) => ((s - first) / span) * 100;

  const curves = buildChannelCurves(
    keyframes,
    interpolation,
    CHANNEL_JOINTS,
    VIEW_WIDTH,
    VIEW_HEIGHT,
    { start: first, end: last }
  );
  const visibleMarkers = markers.filter((marker) => marker.s >= first && marker.s <= last);

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
        <span className="distance-key" data-od-id="channel-legend">
          <span className="channel-swatch channel-hip" />
          hip
          <span className="channel-swatch channel-spine" />
          spine
          <em>{INTERPOLATION_HINT[interpolation]}</em>
        </span>
      </div>

      {visibleMarkers.length > 0 ? (
        <div className="jump-marker-labels" aria-hidden="true">
          {visibleMarkers.map((marker) => (
            <span
              key={marker.id}
              className={`jump-marker-label jump-marker-${marker.id}${
                percentAt(marker.s) < 8 ? " at-start" : percentAt(marker.s) > 92 ? " at-end" : ""
              }`}
              style={{ left: `${String(percentAt(marker.s))}%` }}
            >
              {marker.label}
            </span>
          ))}
        </div>
      ) : null}
      <p className="sr-only">
        {visibleMarkers
          .map((marker) => `${marker.label} at ${marker.s.toFixed(2)} metres`)
          .join(", ")}
      </p>

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
        {visibleMarkers.map((marker) => (
          <i
            key={marker.id}
            className={`jump-marker jump-marker-${marker.id}`}
            data-od-id={`jump-marker-${marker.id}`}
            style={{ left: `${String(percentAt(marker.s))}%` }}
          />
        ))}
        {preview && preview.s !== null ? (
          <i
            className="preview-line"
            data-od-id="preview-playhead"
            style={{ left: `${String(percentAt(preview.s))}%` }}
          />
        ) : null}
        {keyframes.map((key) => {
          const left = percentAt(key.s);
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
                  window.removeEventListener("pointercancel", stop);
                  if (stopDragRef.current === stop) stopDragRef.current = null;
                };

                stopDragRef.current?.();
                stopDragRef.current = stop;
                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", stop);
                window.addEventListener("pointercancel", stop);
              }}
            />
          );
        })}
      </div>

      {preview ? (
        <>
          <input
            className="distance-scrubber"
            data-od-id="preview-scrubber"
            type="range"
            min={first}
            max={last}
            step={0.01}
            value={preview.s ?? first}
            disabled={keyframes.length < 2}
            aria-label="Preview position along the run"
            aria-valuetext={`${(preview.s ?? first).toFixed(2)} metres, ${preview.label}`}
            onChange={(event) => preview.scrubTo(event.currentTarget.valueAsNumber)}
          />
          <div className="distance-transport" data-od-id="preview-transport">
            <Button
              data-od-id="preview-play"
              disabled={keyframes.length < 2}
              icon={preview.playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
              onClick={preview.toggle}
            >
              {preview.playing ? "Pause" : "Play clip"}
            </Button>
            <output className="distance-readout" data-od-id="preview-readout">
              {preview.s === null ? (
                "Editing keys"
              ) : (
                <>
                  s = {preview.s.toFixed(2)} m · <strong>{preview.label}</strong>
                </>
              )}
            </output>
            <label className="distance-rate">
              Speed
              <select
                value={preview.rate}
                onChange={(event) =>
                  preview.setRate(Number(event.currentTarget.value) as PreviewRate)
                }
              >
                {PREVIEW_RATES.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}× entry speed
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      ) : null}
    </section>
  );
};
