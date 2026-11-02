import {
  lipAngleRange,
  spikeControlContracts,
  type Scenario
} from "../../../../../packages/schema/src/index";

import { Field, SegmentedControl } from "../../components/ui";

type InputRailProps = {
  scenario: Scenario;
  onJumpKindChange: (kind: Scenario["jump"]["kind"]) => void;
  onControlChange: (controlId: string, value: number) => void;
  supportedPaths: Set<string>;
};

const contractsById = new Map(spikeControlContracts.map((contract) => [contract.id, contract]));

const valueForControl = (scenario: Scenario, id: string): number => {
  switch (id) {
    case "lip-height":
      return scenario.jump.lipHeight;
    case "lip-angle":
      return scenario.jump.lipAngle;
    case "transition-length":
      return scenario.jump.transitionLength;
    case "gap":
      return scenario.jump.gap;
    case "step-delta":
      return scenario.jump.stepDelta;
    case "landing-angle":
      return scenario.jump.landingAngle;
    case "landing-length":
      return scenario.jump.landingLength;
    case "entry-speed":
      return scenario.entry.speed;
    default:
      throw new Error(`Unknown control ${id}`);
  }
};

const renderControl = (
  scenario: Scenario,
  controlId: string,
  supportedPaths: Set<string>,
  onControlChange: (controlId: string, value: number) => void
) => {
  const contract = contractsById.get(controlId);
  if (!contract) {
    return null;
  }
  const supported = supportedPaths.has(contract.scenarioPath);
  const stepDeltaUnavailable =
    contract.id === "step-delta" &&
    (scenario.jump.kind === "table" || scenario.jump.kind === "gap");
  const angleRange = contract.id === "lip-angle" ? lipAngleRange(scenario.jump) : undefined;
  const landsBelow = scenario.jump.kind === "stepdown" || scenario.jump.kind === "drop";
  const controlMinimum = angleRange
    ? Math.max(contract.minimum, Math.ceil(angleRange.minimum * 100) / 100)
    : contract.id === "step-delta" && scenario.jump.kind === "stepup"
      ? 0.05
      : contract.minimum;
  const controlMaximum = angleRange
    ? angleRange.maximum
    : contract.id === "step-delta" && landsBelow
      ? -0.05
      : contract.maximum;
  const disabled = !supported || stepDeltaUnavailable;
  const disabledReason = !supported
    ? "Awaiting core support for this input path."
    : stepDeltaUnavailable
      ? "Choose Step up, Step down, or Drop to adjust landing elevation."
      : undefined;
  return (
    <Field
      key={contract.id}
      id={contract.id}
      label={contract.label}
      value={valueForControl(scenario, contract.id)}
      minimum={controlMinimum}
      maximum={controlMaximum}
      step={contract.step}
      unit={contract.unit}
      explanation={contract.explanation}
      disabled={disabled}
      disabledReason={disabledReason}
      onChange={(value) => onControlChange(contract.id, value)}
    />
  );
};

export const InputRail = ({
  scenario,
  onJumpKindChange,
  onControlChange,
  supportedPaths
}: InputRailProps) => {
  return (
    <aside className="rail left-rail" data-od-id="input-rail" aria-label="Scenario inputs">
      <section className="control-group" data-od-id="panel-jump-shape">
        <h2>Jump shape</h2>
        <div className="field" data-od-id="jump-kind">
          <SegmentedControl
            label="Jump kind"
            value={scenario.jump.kind}
            options={[
              { value: "table", label: "Table" },
              { value: "gap", label: "Gap" },
              { value: "stepup", label: "Step up" },
              { value: "stepdown", label: "Step down" },
              { value: "drop", label: "Drop" }
            ]}
            disabled={!supportedPaths.has("scenario.jump.kind")}
            onChange={(value) => onJumpKindChange(value as Scenario["jump"]["kind"])}
          />
        </div>
        {renderControl(scenario, "lip-height", supportedPaths, onControlChange)}
        {renderControl(scenario, "lip-angle", supportedPaths, onControlChange)}
        {renderControl(scenario, "transition-length", supportedPaths, onControlChange)}
        {renderControl(scenario, "gap", supportedPaths, onControlChange)}
      </section>

      <section className="control-group" data-od-id="panel-jump-landing">
        <h2>Landing</h2>
        {renderControl(scenario, "step-delta", supportedPaths, onControlChange)}
        {renderControl(scenario, "landing-angle", supportedPaths, onControlChange)}
        {renderControl(scenario, "landing-length", supportedPaths, onControlChange)}
      </section>

      <section className="control-group" data-od-id="panel-jump-entry">
        <h2>Entry</h2>
        {renderControl(scenario, "entry-speed", supportedPaths, onControlChange)}
      </section>
    </aside>
  );
};
