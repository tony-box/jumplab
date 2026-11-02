import { memo } from "react";
import type {
  BaselineSelection,
  RunArtifact,
  RunResult
} from "../../../../../packages/schema/src/index";

import { MetricRow } from "../../components/ui";
import { getMetricGroup, summarizeLanding, type MetricGroupId } from "./baseline-comparator";

type MetricsRailProps = {
  run: RunResult | null;
  baselineSelection: BaselineSelection;
  baselineArtifact: RunArtifact | null;
};

const LandingVerdict = ({ run }: { run: RunResult | null }) => {
  if (!run) {
    return (
      <section
        className="metric-group landing-verdict"
        data-od-id="landing-outcome"
        data-tone="none"
      >
        <h2>Outcome</h2>
        <p className="empty-state">Solve the run to see where and how it lands.</p>
      </section>
    );
  }
  const summary = summarizeLanding(run.landing);
  return (
    <section
      className="metric-group landing-verdict"
      data-od-id="landing-outcome"
      data-tone={summary.tone}
      aria-live="polite"
    >
      <h2>Outcome</h2>
      <p className="verdict-title">{summary.title}</p>
      {summary.detail ? <p className="verdict-detail">{summary.detail}</p> : null}
      {summary.reasons.length > 0 ? (
        <ul className="verdict-reasons">
          {summary.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};

const groups: Array<{ id: MetricGroupId; heading: string }> = [
  { id: "takeoff", heading: "Takeoff" },
  { id: "air", heading: "Air" },
  { id: "landing", heading: "Landing" },
  { id: "rider", heading: "Rider" },
  { id: "energy", heading: "Energy" }
];

const MetricsRailView = ({ run, baselineSelection, baselineArtifact }: MetricsRailProps) => {
  const comparing = baselineArtifact !== null && baselineSelection.compatibility !== "none";
  return (
    <aside className="rail metrics-rail" data-od-id="metrics-rail" aria-label="Run metrics">
      <LandingVerdict run={run} />

      {groups.map(({ id, heading }) => {
        const metrics = getMetricGroup(run, baselineArtifact, baselineSelection, id);
        return (
          <section key={id} className="metric-group" data-od-id={`metrics-${id}`}>
            <h2>{heading}</h2>
            {metrics.length === 0 ? <p className="empty-state">No run yet.</p> : null}
            {metrics.map((entry) => (
              <MetricRow
                key={entry.id}
                label={entry.label}
                metric={entry.metric}
                delta={comparing ? entry.delta : undefined}
              />
            ))}
          </section>
        );
      })}

      <section className="metric-group" data-od-id="baseline-card">
        <h2>Baseline</h2>
        {comparing ? (
          <p className="rail-note">
            Deltas compare against run{" "}
            <span className="num">{baselineArtifact.runId.slice(0, 8)}</span>.
          </p>
        ) : (
          <p className="empty-state">Pin a run as the baseline to compare against it.</p>
        )}
        {baselineSelection.compatibility === "version-warning" ? (
          <p className="rail-note">
            The baseline was solved with a different solver version; compare deltas cautiously.
          </p>
        ) : null}
        {baselineSelection.reasons.map((reason) => (
          <p key={reason} className="rail-note">
            {reason}
          </p>
        ))}
      </section>
    </aside>
  );
};

/** Memoized so playback, which re-renders the page every frame, does not re-render the rail. */
export const MetricsRail = memo(MetricsRailView);
