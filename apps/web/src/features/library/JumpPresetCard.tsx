import type { Preset, Scenario } from "../../../../../packages/schema/src/index";

import { Button } from "../../components/ui";
import { createPresetThumbnailPath } from "./preset-thumbnail";

type JumpPresetCardProps = {
  preset: Preset;
  scenario: Scenario;
  onLoad: (presetId: string) => void;
  onDuplicate: (presetId: string) => void;
};

const formatSpeedWindow = (preset: Preset): string => {
  if (!preset.speedWindow) {
    return "Awaiting measured entry-speed guidance";
  }

  if (preset.speedWindow.status === "unavailable") {
    return preset.speedWindow.reason
      ? `Unavailable: ${preset.speedWindow.reason}`
      : "Unavailable: no measured window yet";
  }

  return `${preset.speedWindow.minimum.toFixed(2)} - ${preset.speedWindow.maximum.toFixed(2)} m/s`;
};

const severityLabel = (scenario: Scenario): string => {
  if (scenario.jump.lipAngle >= 0.68 || Math.abs(scenario.jump.stepDelta) >= 1.2) {
    return "Demanding";
  }
  if (scenario.jump.lipAngle <= 0.42 && scenario.jump.gap <= 6) {
    return "Forgiving";
  }
  return "Intermediate";
};

export const JumpPresetCard = ({ preset, scenario, onLoad, onDuplicate }: JumpPresetCardProps) => {
  const thumbnail = createPresetThumbnailPath(scenario);
  const speedLabel = formatSpeedWindow(preset);

  return (
    <article className="jump-preset-card" data-od-id={`jump-card-${preset.id}`}>
      <div className="jump-preset-thumbnail" data-od-id="jump-thumbnail">
        <svg viewBox="0 0 340 132" role="img" aria-label={`${preset.name} terrain profile`}>
          <rect width="340" height="132" fill="#303841" />
          <path d={thumbnail.fillPath} fill="#3f4b56" />
          <path
            d={thumbnail.terrainPath}
            fill="none"
            stroke="#dbe3e8"
            strokeWidth="2.8"
            strokeLinejoin="round"
          />
          {thumbnail.markers.map((marker, index) => (
            <circle key={index} cx={marker.x} cy={marker.y} r="3" fill="#8bd194" />
          ))}
        </svg>
        <span className="jump-kind-tag">{preset.tags[0] ?? preset.category}</span>
      </div>

      <header>
        <h3>{preset.name}</h3>
        <span className="severity-badge">{severityLabel(scenario)}</span>
      </header>

      <p>{preset.note}</p>

      <dl>
        <dt>Lip height / angle</dt>
        <dd>
          {scenario.jump.lipHeight.toFixed(2)} m /{" "}
          {(scenario.jump.lipAngle * (180 / Math.PI)).toFixed(0)} deg
        </dd>
        <dt>Gap / step</dt>
        <dd>
          {scenario.jump.gap.toFixed(1)} m / {scenario.jump.stepDelta >= 0 ? "+" : ""}
          {scenario.jump.stepDelta.toFixed(1)} m
        </dd>
        <dt>Landing angle</dt>
        <dd>{(scenario.jump.landingAngle * (180 / Math.PI)).toFixed(0)} deg</dd>
      </dl>

      <div
        className="speed-window"
        data-window-status={preset.speedWindow?.status ?? "unavailable"}
        data-od-id="window-status"
      >
        <span>Entry speed window</span>
        <strong>{speedLabel}</strong>
      </div>

      <footer>
        <Button data-od-id="load-preset" onClick={() => onLoad(preset.id)}>
          Load
        </Button>
        <Button data-od-id="duplicate-preset" onClick={() => onDuplicate(preset.id)}>
          Duplicate
        </Button>
      </footer>
    </article>
  );
};
