import { useMemo } from "react";

import type {
  BaselineSelection,
  Metric,
  RunArtifact
} from "../../../../../packages/schema/src/index";
import { RunChart, type RunChartPoint } from "../../rendering/charts";
import { createFrameBufferView, createTelemetryBufferView } from "../../solver/frame-buffer";

type ReportResultsProps = {
  run: RunArtifact;
  baseline: RunArtifact | null;
  comparison: BaselineSelection;
};

type MetricRow = {
  id: string;
  label: string;
  run: Metric | null;
  baseline: Metric | null;
};

const niceMetricName = (metricId: string): string => metricId.replace(/([A-Z])/g, " $1");

const toPoints = (
  artifact: RunArtifact,
  xField: string,
  yField: string,
  transformY?: (value: number) => number
): RunChartPoint[] => {
  const frameView = createFrameBufferView(artifact.manifest.frameLayout, artifact.frameBuffer);
  const hasX = artifact.manifest.frameLayout.fields.some((field) => field.name === xField);
  const hasY = artifact.manifest.frameLayout.fields.some((field) => field.name === yField);
  if (!hasX || !hasY) {
    return [];
  }

  return Array.from({ length: frameView.frameCount }, (_unused, index) => {
    const x = frameView.readField(index, xField)[0] ?? 0;
    const y = frameView.readField(index, yField)[0] ?? 0;
    return {
      x,
      y: transformY ? transformY(y) : y
    };
  });
};

const deltaText = (
  run: Metric | null,
  baseline: Metric | null,
  comparison: BaselineSelection,
  baselineRunId: string | null,
  runId: string
): string => {
  if (!run || !baseline) {
    return "";
  }
  if (baselineRunId === runId) {
    return "";
  }
  if (comparison.compatibility === "none" || comparison.compatibility === "incompatible") {
    return "";
  }
  if (run.value === null || baseline.value === null) {
    return "";
  }
  if (run.source !== baseline.source) {
    return "";
  }

  const delta = run.value - baseline.value;
  const prefix = delta > 0 ? "+" : "";
  return `${prefix}${delta.toFixed(3)} ${run.unit}`;
};

const renderMetricValue = (metric: Metric | null): string => {
  if (!metric || metric.value === null) {
    return "";
  }
  return `${metric.value.toFixed(3)} ${metric.unit}`;
};

const summarizeTelemetry = (artifact: RunArtifact): Array<[string, string, string]> => {
  const telemetry = createTelemetryBufferView(
    artifact.manifest.telemetry,
    artifact.telemetryBuffer
  );

  return artifact.manifest.telemetry.channels.map((channel) => {
    const values = telemetry.readChannel(channel.name);
    const sum = values.reduce((total, value) => total + value, 0);
    const mean = values.length > 0 ? sum / values.length : Number.NaN;
    return [
      channel.name,
      Number.isFinite(mean) ? `${mean.toFixed(3)} ${channel.unit}` : "",
      channel.unit
    ];
  });
};

export const ReportResults = ({ run, baseline, comparison }: ReportResultsProps) => {
  const rows = useMemo<MetricRow[]>(() => {
    const ids = new Set<string>([
      ...Object.keys(run.manifest.metrics),
      ...Object.keys(baseline?.manifest.metrics ?? {})
    ]);

    return [...ids].map((id) => ({
      id,
      label: niceMetricName(id),
      run: run.manifest.metrics[id] ?? null,
      baseline: baseline?.manifest.metrics[id] ?? null
    }));
  }, [baseline?.manifest.metrics, run.manifest.metrics]);

  const headline = rows.slice(0, 4);
  const runHeight = toPoints(run, "x", "y");
  const baselineHeight = baseline ? toPoints(baseline, "x", "y") : [];
  const runVy = toPoints(run, "t", "vy");
  const baselineVy = baseline ? toPoints(baseline, "t", "vy") : [];
  const runPitch = toPoints(run, "t", "pitch", (value) => (value * 180) / Math.PI);
  const baselinePitch = baseline
    ? toPoints(baseline, "t", "pitch", (value) => (value * 180) / Math.PI)
    : [];
  const runImpulse = toPoints(run, "t", "contactImpulse");
  const baselineImpulse = baseline ? toPoints(baseline, "t", "contactImpulse") : [];

  const energyRows = summarizeTelemetry(run);

  return (
    <>
      <h2 className="section-heading">Headline</h2>
      <div className="headline-grid" data-od-id="headline-stats">
        {headline.map((entry) => (
          <article key={entry.id} className="headline-stat" data-od-id={`stat-${entry.id}`}>
            <h3>{entry.label}</h3>
            <strong>{renderMetricValue(entry.run) || "-"}</strong>
            <span>
              {deltaText(
                entry.run,
                entry.baseline,
                comparison,
                baseline?.runId ?? null,
                run.runId
              ) || " "}
            </span>
          </article>
        ))}
      </div>

      <h2 className="section-heading">Trajectory and state</h2>
      <section className="report-charts" data-od-id="charts">
        <RunChart
          dataOdId="chart-height"
          title="Height above lip vs distance"
          xLabel="m"
          yLabel="m"
          ariaLabel="Height above lip versus distance"
          series={[
            {
              id: "baseline-height",
              label: "Baseline",
              color: "#9ea7ae",
              points: baselineHeight,
              dashed: true
            },
            {
              id: "run-height",
              label: "Run",
              color: "#3f9f67",
              points: runHeight,
              fillAlpha: 0.16
            }
          ]}
        />
        <RunChart
          dataOdId="chart-vy"
          title="Vertical velocity vs time"
          xLabel="s"
          yLabel="m/s"
          ariaLabel="Vertical velocity versus time"
          series={[
            {
              id: "baseline-vy",
              label: "Baseline",
              color: "#9ea7ae",
              points: baselineVy,
              dashed: true
            },
            {
              id: "run-vy",
              label: "Run",
              color: "#3f9f67",
              points: runVy,
              fillAlpha: 0.12
            }
          ]}
        />
        <RunChart
          dataOdId="chart-pitch"
          title="Bike pitch vs time"
          xLabel="s"
          yLabel="deg"
          ariaLabel="Bike pitch versus time"
          series={[
            {
              id: "baseline-pitch",
              label: "Baseline",
              color: "#9ea7ae",
              points: baselinePitch,
              dashed: true
            },
            {
              id: "run-pitch",
              label: "Run",
              color: "#3f9f67",
              points: runPitch
            }
          ]}
        />
        <RunChart
          dataOdId="chart-impulse"
          title="Contact impulse vs time"
          xLabel="s"
          yLabel="N*s"
          ariaLabel="Contact impulse versus time"
          series={[
            {
              id: "baseline-impulse",
              label: "Baseline",
              color: "#9ea7ae",
              points: baselineImpulse,
              dashed: true
            },
            {
              id: "run-impulse",
              label: "Run",
              color: "#3f9f67",
              points: runImpulse
            }
          ]}
        />
      </section>

      <h2 className="section-heading">Full metric table</h2>
      <div className="report-card report-table">
        <table className="data-table" data-od-id="metric-table">
          <caption className="sr-only">Run metrics with baseline and source disclosure</caption>
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">Run</th>
              <th scope="col">Baseline</th>
              <th scope="col">Delta</th>
              <th scope="col">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">{row.label}</th>
                <td>{renderMetricValue(row.run)}</td>
                <td>{renderMetricValue(row.baseline)}</td>
                <td data-od-id={`delta-${row.id}`}>
                  {deltaText(row.run, row.baseline, comparison, baseline?.runId ?? null, run.runId)}
                </td>
                <td>{row.run?.source ?? row.baseline?.source ?? "pending-core"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section-heading">Energy balance</h2>
      <div className="report-card report-table">
        <table className="data-table" data-od-id="energy-table">
          <caption className="sr-only">Energy and telemetry summary</caption>
          <thead>
            <tr>
              <th scope="col">Channel</th>
              <th scope="col">Run mean</th>
              <th scope="col">Unit</th>
            </tr>
          </thead>
          <tbody>
            {energyRows.map(([channel, value, unit]) => (
              <tr key={channel}>
                <th scope="row">{channel}</th>
                <td>{value}</td>
                <td>{unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="energy-note" data-od-id="energy-note">
        Read residual channels as numerical diagnostics only. Missing channels remain blank until
        the core exposes measured telemetry.
      </p>

      <h2 className="section-heading">Published accuracy bounds</h2>
      <section className="accuracy-grid" data-od-id="accuracy-bounds">
        <article className="bound-card">
          <h3>Ballistic phase</h3>
          <p>Bounded by floating-point precision for this fixture output.</p>
        </article>
        <article className="bound-card">
          <h3>Energy drift</h3>
          <p>Interpret against validation convergence trends, not as direct dissipation.</p>
        </article>
        <article className="bound-card">
          <h3>Model scope</h3>
          <p>
            Planar sagittal model; unavailable effects are disclosed and never promoted to measured.
          </p>
        </article>
      </section>
    </>
  );
};
