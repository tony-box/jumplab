import { memo } from "react";
import type { PoseClip } from "../../../../../packages/schema/src/index";

import { Button } from "../../components/ui";

type KeyframeRailProps = {
  keyframes: Array<{ id: string; s: number; label: string }>;
  selectedKeyId: string | null;
  interpolation: PoseClip["interpolation"];
  onSelectByIndex: (index: number) => void;
  onSelectKey: (keyId: string) => void;
  onAddKeyframe: () => void;
  onDeleteSelected: () => void;
  onInterpolationChange: (value: PoseClip["interpolation"]) => void;
};

const KeyframeRailView = ({
  keyframes,
  selectedKeyId,
  interpolation,
  onSelectByIndex,
  onSelectKey,
  onAddKeyframe,
  onDeleteSelected,
  onInterpolationChange
}: KeyframeRailProps) => {
  const selectedIndex = Math.max(
    0,
    keyframes.findIndex((key) => key.id === selectedKeyId)
  );

  return (
    <aside className="rail pose-key-rail" data-od-id="keyframe-rail" aria-label="Pose keyframes">
      <section className="control-group">
        <h2>
          Keyframes <span className="group-hint">distance-relative</span>
        </h2>
        <p className="rail-note">
          Keys are single-select and distance anchored. Valid edits keep strict ordering and
          immediately apply to the active scenario.
        </p>
      </section>

      <div
        className="key-list"
        role="listbox"
        aria-label="Keyframe list"
        aria-activedescendant={selectedKeyId ? `keyframe-option-${selectedKeyId}` : undefined}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            onSelectByIndex(selectedIndex + 1);
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            onSelectByIndex(selectedIndex - 1);
            return;
          }
          if (event.key === "Home") {
            event.preventDefault();
            onSelectByIndex(0);
            return;
          }
          if (event.key === "End") {
            event.preventDefault();
            onSelectByIndex(keyframes.length - 1);
          }
        }}
      >
        {keyframes.map((keyframe, index) => (
          <button
            key={keyframe.id}
            id={`keyframe-option-${keyframe.id}`}
            data-od-id="keyframe-option"
            type="button"
            role="option"
            aria-selected={keyframe.id === selectedKeyId}
            className={`key-row-option ${keyframe.id === selectedKeyId ? "selected" : ""}`}
            onClick={() => onSelectKey(keyframe.id)}
          >
            <strong className="num">{keyframe.s.toFixed(2)} m</strong>
            <span>
              {keyframe.label}
              <small>{index === 0 ? "start" : "pose target"}</small>
            </span>
          </button>
        ))}
      </div>

      <section className="control-group">
        <div className="storage-actions">
          <Button id="add-keyframe" data-od-id="add-keyframe" onClick={onAddKeyframe}>
            Add keyframe
          </Button>
          <Button
            aria-label="Delete key"
            onClick={onDeleteSelected}
            disabled={keyframes.length <= 2}
          >
            Delete key
          </Button>
        </div>
      </section>

      <section className="control-group">
        <h2>Interpolation</h2>
        <select
          id="interp-mode"
          data-od-id="interp-mode"
          value={interpolation}
          aria-label="Interpolation mode"
          onChange={(event) =>
            onInterpolationChange(event.currentTarget.value as PoseClip["interpolation"])
          }
        >
          <option value="cubic">Cubic Hermite</option>
          <option value="linear">Linear</option>
          <option value="step">Step (hold)</option>
        </select>
      </section>
    </aside>
  );
};

/** Memoized so clip preview, which re-renders the page every frame, skips this rail. */
export const KeyframeRail = memo(KeyframeRailView);
