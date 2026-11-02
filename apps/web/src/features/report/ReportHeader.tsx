import type { BaselineSelection, RunArtifact } from "../../../../../packages/schema/src/index";

type RunListEntry = {
  runId: string;
  createdAt: string;
  source: "solver" | "representative-fixture";
  legacySnapshotMissing?: boolean;
};

type ReportHeaderProps = {
  runs: RunListEntry[];
  selectedRunId: string;
  selectedBaselineRunId: string;
  current: RunArtifact;
  comparison: BaselineSelection;
  onSelectRun: (runId: string) => void;
  onSelectBaseline: (runId: string) => void;
  disabled?: boolean;
};

const optionLabel = (entry: RunListEntry): string => {
  const stamp = new Date(entry.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
  const source = entry.source === "solver" ? "solver" : "fixture";
  return `${entry.runId.slice(0, 8)} (${stamp}, ${source})`;
};

const comparisonText = (comparison: BaselineSelection): string => {
  switch (comparison.compatibility) {
    case "none":
      return "No baseline selected";
    case "compatible":
      return "Compatible baseline";
    case "version-warning":
      return "Cross-version comparison";
    case "incompatible":
      return "Incompatible baseline metadata";
    default:
      return "Baseline unavailable";
  }
};

export const ReportHeader = ({
  runs,
  selectedRunId,
  selectedBaselineRunId,
  current,
  comparison,
  onSelectRun,
  onSelectBaseline,
  disabled
}: ReportHeaderProps) => {
  return (
    <>
      <section className="report-header" data-od-id="report-header">
        <div style={{ flex: 1, minWidth: 280 }}>
          <h1>{current.scenarioSnapshot.name} run outcome</h1>
          <p>
            run {current.runId.slice(0, 8)} · source {current.source} · solver{" "}
            {current.model.solverVersion}
          </p>
        </div>

        <div className="compare" data-od-id="run-compare">
          <label className="lbl" htmlFor="report-run-select">
            Run
          </label>
          <select
            id="report-run-select"
            aria-label="Select run"
            value={selectedRunId}
            onChange={(event) => onSelectRun(event.target.value)}
            disabled={disabled}
          >
            {runs.map((entry) => (
              <option key={entry.runId} value={entry.runId}>
                {optionLabel(entry)}
              </option>
            ))}
          </select>

          <label className="lbl" htmlFor="report-baseline-select">
            Baseline
          </label>
          <select
            id="report-baseline-select"
            aria-label="Select baseline"
            value={selectedBaselineRunId}
            onChange={(event) => onSelectBaseline(event.target.value)}
            disabled={disabled}
          >
            <option value="">None</option>
            {runs.map((entry) => (
              <option key={`baseline-${entry.runId}`} value={entry.runId}>
                {optionLabel(entry)}
              </option>
            ))}
          </select>
        </div>
      </section>

      <div className="report-swatches" aria-live="polite">
        <span className="swatch run">
          <i aria-hidden="true" />
          Run
        </span>
        <span className="swatch baseline">
          <i aria-hidden="true" />
          Baseline
        </span>
        <span className="swatch-state">{comparisonText(comparison)}</span>
      </div>

      {comparison.compatibility === "version-warning" ? (
        <p className="report-warning" data-od-id="solver-version-warning" role="status">
          Solver versions differ. Deltas are shown with a cross-version warning.
        </p>
      ) : null}
      {comparison.compatibility === "incompatible" ? (
        <p className="report-warning" data-od-id="solver-version-warning" role="status">
          Baseline metadata is incompatible. Delta cells remain blank.
        </p>
      ) : null}
    </>
  );
};
