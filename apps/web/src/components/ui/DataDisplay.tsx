import type { Metric } from "../../../../../packages/schema/src/index";

const sourceLabel = (source: Metric["source"]): string =>
  source === "pending-core" ? "awaiting core" : source;

/** Angles are stored in radians but read in degrees. */
const displayValue = (value: number, unit: string): { text: string; unit: string } =>
  unit === "rad"
    ? { text: ((value * 180) / Math.PI).toFixed(1), unit: "°" }
    : { text: value.toFixed(Math.abs(value) >= 100 ? 0 : 2), unit };

export const MetricRow = ({
  label,
  metric,
  delta
}: {
  label: string;
  metric: Metric;
  /** Difference from the pinned baseline, in the metric's own unit. */
  delta?: number | null;
}) => {
  const shown = metric.value === null ? null : displayValue(metric.value, metric.unit);
  const shownDelta =
    delta === undefined || delta === null ? null : displayValue(delta, metric.unit);
  return (
    <div className={`metric-row metric-${metric.source}`} title={metric.reason ?? undefined}>
      <span>{label}</span>
      <strong className="num">
        {shown ? shown.text : "—"} <small>{shown ? shown.unit : metric.unit}</small>
      </strong>
      {shownDelta ? (
        <span className="metric-delta num" aria-label={`${shownDelta.text} versus baseline`}>
          {delta !== null && delta !== undefined && delta > 0 ? "+" : ""}
          {shownDelta.text}
        </span>
      ) : null}
      {metric.source !== "measured" ? (
        <span className="metric-source">{sourceLabel(metric.source)}</span>
      ) : null}
      {metric.reason ? <span className="metric-reason">{metric.reason}</span> : null}
    </div>
  );
};
