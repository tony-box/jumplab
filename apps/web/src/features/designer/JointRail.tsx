import type {
  DesignConflict,
  PoseKeyValidation,
  PoseSample,
  Scenario
} from "../../../../../packages/schema/src/index";

import { DataTable, Field } from "../../components/ui";
import type { JointRange, PoseFeasibleLimits } from "./pose-limits";
import { poseAuthoringRange, type JointName } from "./pose-sampling";

const joints: JointName[] = ["knee", "hip", "spine"];

const toDegrees = (radians: number): string => `${((radians * 180) / Math.PI).toFixed(1)} deg`;

type JointRailProps = {
  scenario: Scenario;
  selectedS: number;
  selectedTargets: Record<JointName, number>;
  sample: PoseSample | null;
  feasibleLimits: PoseFeasibleLimits | null;
  envelopeLimits: PoseFeasibleLimits | null;
  validation: PoseKeyValidation | null;
  limitingConflicts: DesignConflict[];
  onTargetChange: (joint: JointName, value: number) => void;
};

export const JointRail = ({
  scenario,
  selectedS,
  selectedTargets,
  sample,
  feasibleLimits,
  envelopeLimits,
  validation,
  limitingConflicts,
  onTargetChange
}: JointRailProps) => {
  const jointRows = joints.map((joint) => {
    const range = feasibleLimits?.[joint] ?? poseAuthoringRange(scenario, joint);
    const achieved = sample?.targets[joint] ?? selectedTargets[joint];
    const error = achieved - selectedTargets[joint];
    return [
      joint.charAt(0).toUpperCase() + joint.slice(1),
      toDegrees(selectedTargets[joint]),
      toDegrees(achieved),
      toDegrees(error),
      toDegrees(range.min),
      toDegrees(range.max)
    ];
  });

  const romRows = ["knee", "hip", "spine", "shoulder", "elbow"].map((jointName) => {
    const joint = scenario.rider.joints[jointName as keyof typeof scenario.rider.joints];
    const rom = joint.max - joint.min;
    return [
      jointName[0]?.toUpperCase() + jointName.slice(1),
      toDegrees(joint.min),
      toDegrees(joint.max),
      toDegrees(rom),
      `${joint.tauMax.toFixed(0)} N.m`
    ];
  });

  return (
    <aside className="rail pose-joint-rail" data-od-id="joint-rail" aria-label="Joint targets">
      <section className="control-group">
        <h2>
          Joint targets <span className="group-hint">at s = {selectedS.toFixed(2)} m</span>
        </h2>

        <div data-od-id="joint-table">
          <DataTable
            caption="Joint target and sampled pose"
            columns={["Joint", "Target", "Sampled", "Error", "Min", "Max"]}
            rows={jointRows}
          />
        </div>

        <p className="rail-note">
          Shoulder and elbow are constrained by handle reach:{" "}
          <span data-testid="pose-shoulder-value">
            {toDegrees(sample?.derivedArm.shoulder ?? 0)}
          </span>
          {" / "}
          <span data-testid="pose-elbow-value">{toDegrees(sample?.derivedArm.elbow ?? 0)}</span>
        </p>
      </section>

      <section className="control-group">
        <h2>Clearance and contacts</h2>
        <p className="rail-note" data-od-id="selected-key-clearance">
          {validation
            ? `Minimum separation ${validation.minimumSeparation.toFixed(3)} m.`
            : "Clearance pending."}
        </p>
        <ul className="pose-contact-list">
          {validation?.contacts
            .filter((contact) => contact.active)
            .map((contact) => (
              <li key={`${contact.kind}-${contact.riderPart}-${contact.bikePart}`}>
                <strong>
                  {contact.kind === "saddle" ? "Saddle contact" : `${contact.kind} contact`}
                </strong>
                <span>
                  {contact.riderPart} / {contact.bikePart}
                </span>
              </li>
            ))}
        </ul>
        {limitingConflicts.length > 0 ? (
          <p className="rail-note" data-od-id="selected-key-limit">
            Limited by {limitingConflicts[0]?.riderPart ?? "pose"} /{" "}
            {limitingConflicts[0]?.bikePart ?? "geometry"}.
          </p>
        ) : null}
      </section>

      <section className="control-group">
        <h2>Edit pose</h2>
        {joints.map((joint) => {
          const declared = poseAuthoringRange(scenario, joint);
          const reachable = feasibleLimits?.[joint];
          const envelope = envelopeLimits?.[joint];
          // The track stops at the range the rail reports, so the control can
          // never offer a value that is already shown as out of range.
          const spans = (range?: JointRange) =>
            range && range.max - range.min >= 0.01 ? range : null;
          const extent = spans(reachable) ?? spans(envelope) ?? declared;
          return (
            <Field
              key={joint}
              id={`pose-${joint}`}
              label={joint.charAt(0).toUpperCase() + joint.slice(1)}
              value={selectedTargets[joint]}
              minimum={extent.min}
              maximum={extent.max}
              step={0.01}
              unit="rad"
              reachableRange={reachable}
              onChange={(value) => onTargetChange(joint, value)}
            />
          );
        })}
      </section>

      <section className="control-group">
        <h2>Joint ROM summary</h2>
        <div data-od-id="rom-table">
          <DataTable
            caption="Rider joint limits and range of motion"
            columns={["Joint", "Min", "Max", "ROM", "Tau max"]}
            rows={romRows}
          />
        </div>
      </section>
    </aside>
  );
};
