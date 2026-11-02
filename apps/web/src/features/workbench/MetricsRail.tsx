import type {
  BaselineSelection,
  RunArtifact,
  RunResult
} from "../../../../../packages/schema/src/index";

import { MetricRow } from "../../components/ui";
import { getMetricGroup } from "./baseline-comparator";

type MetricsRailProps = {
  run: RunResult | null;
  baselineSelection: BaselineSelection;
  baselineArtifact: RunArtifact | null;
};

const BaselineCard = ({
  baselineSelection,
  baselineArtifact
}: {
  baselineSelection: BaselineSelection;
  baselineArtifact: RunArtifact | null;
}) => (
  <section className="metric-group" data-od-id="baseline-card">
    <h2>Baseline</h2>
    <div className="metric-row">
      <span>Selection</span>
      <strong className="num">{baselineSelection.compatibility}</strong>
    </div>
    <div className="metric-row">
      <span>Run ID</span>
      <strong className="num">{baselineArtifact?.runId.slice(0, 8) ?? "none"}</strong>
    </div>
    {baselineSelection.reasons.map((reason) => (
      <p key={reason} className="rail-note">
        {reason}
      </p>
    ))}
  </section>
);

const MetricGroup = ({
  id,
  heading,
  run,
  baseline,
  baselineSelection
}: {
  id: string;
  heading: string;
  run: RunResult | null;
  baseline: RunArtifact | null;
  baselineSelection: BaselineSelection;
}) => {
  const groupId =
    id === "metrics-takeoff"
      ? "takeoff"
      : id === "metrics-air"
        ? "air"
        : id === "metrics-landing"
          ? "landing"
          : "energy";
  const metrics = getMetricGroup(run, baseline, baselineSelection, groupId);

  return (
    <section className="metric-group" data-od-id={id}>
      <h2>{heading}</h2>
      {metrics.length === 0 ? <p className="empty-state">No metrics available yet.</p> : null}
      {metrics.map((entry) => (
        <div key={entry.id}>
          <MetricRow label={entry.label} metric={entry.metric} />
          <div className="metric-row">
            <span>Delta</span>
            <strong className="num">{entry.delta === null ? "-" : entry.delta.toFixed(2)}</strong>
          </div>
        </div>
      ))}
    </section>
  );
};

export const MetricsRail = ({ run, baselineSelection, baselineArtifact }: MetricsRailProps) => {
  const pending = getMetricGroup(run, baselineArtifact, baselineSelection, "pending-core");

  return (
    <aside className="rail metrics-rail" data-od-id="metrics-rail" aria-label="Run metrics">
      <BaselineCard baselineSelection={baselineSelection} baselineArtifact={baselineArtifact} />
      <MetricGroup
        id="metrics-takeoff"
        heading="Takeoff"
        run={run}
        baseline={baselineArtifact}
        baselineSelection={baselineSelection}
      />
      <MetricGroup
        id="metrics-air"
        heading="Air"
        run={run}
        baseline={baselineArtifact}
        baselineSelection={baselineSelection}
      />
      <MetricGroup
        id="metrics-landing"
        heading="Landing"
        run={run}
        baseline={baselineArtifact}
        baselineSelection={baselineSelection}
      />
      <MetricGroup
        id="metrics-energy"
        heading="Energy"
        run={run}
        baseline={baselineArtifact}
        baselineSelection={baselineSelection}
      />

      <section className="metric-group" data-od-id="metrics-core-pending">
        <h2>Awaiting core</h2>
        {pending.length === 0 ? <p className="empty-state">No pending-core channels.</p> : null}
        {pending.map((entry) => (
          <MetricRow key={entry.id} label={entry.label} metric={entry.metric} />
        ))}
      </section>

      <section className="metric-group" data-od-id="core-detached-warning">
        <h2>Version warning</h2>
        {baselineSelection.compatibility === "version-warning" ? (
          <p className="rail-note">
            Baseline was solved with a different solver version; compare deltas cautiously.
          </p>
        ) : (
          <p className="rail-note">No solver-version mismatch is currently active.</p>
        )}
      </section>
    </aside>
  );
};
