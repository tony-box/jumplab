import type { Metric } from "../../../../../packages/schema/src/index";

const sourceLabel = (source: Metric["source"]): string =>
  source === "pending-core" ? "awaiting core" : source;

export const MetricRow = ({ label, metric }: { label: string; metric: Metric }) => (
  <div className={`metric-row metric-${metric.source}`} title={metric.reason ?? undefined}>
    <span>{label}</span>
    <strong className="num">
      {metric.value === null ? "pending" : metric.value.toFixed(2)} <small>{metric.unit}</small>
    </strong>
    <span className="metric-source">{sourceLabel(metric.source)}</span>
    {metric.reason ? <span className="sr-only">{metric.reason}</span> : null}
  </div>
);
