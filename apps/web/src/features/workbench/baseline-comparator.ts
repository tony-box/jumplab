import type {
  BaselineSelection,
  Metric,
  RunArtifact,
  RunResult
} from "../../../../../packages/schema/src/index";

export type MetricGroupId = "takeoff" | "air" | "landing" | "energy" | "pending-core";

export type MetricWithDelta = {
  id: string;
  label: string;
  metric: Metric;
  delta: number | null;
};

const groupMetricIds: Record<Exclude<MetricGroupId, "pending-core">, string[]> = {
  takeoff: ["takeoffSpeed"],
  air: ["airtime", "maxHeight"],
  landing: ["landingImpulse"],
  energy: ["motorWork"]
};

const toLabel = (id: string): string => id.replace(/([A-Z])/g, " $1").trim();

const metricDelta = (
  metric: Metric,
  baselineMetric: Metric | undefined,
  compatibility: BaselineSelection["compatibility"]
): number | null => {
  if (!baselineMetric || compatibility === "none" || compatibility === "incompatible") {
    return null;
  }
  if (metric.value === null || baselineMetric.value === null) {
    return null;
  }
  return metric.value - baselineMetric.value;
};

export const getMetricGroup = (
  result: RunResult | null,
  baseline: RunArtifact | null,
  baselineSelection: BaselineSelection,
  group: MetricGroupId
): MetricWithDelta[] => {
  if (!result) {
    return [];
  }

  const baselineMetrics = baseline?.manifest.metrics ?? {};

  if (group === "pending-core") {
    return Object.entries(result.metrics)
      .filter(([, metric]) => metric.source === "pending-core")
      .map(([id, metric]) => ({
        id,
        label: toLabel(id),
        metric,
        delta: null
      }));
  }

  const metricIds = groupMetricIds[group];
  return metricIds
    .map((id) => {
      const metric = result.metrics[id];
      if (!metric) {
        return null;
      }
      return {
        id,
        label: toLabel(id),
        metric,
        delta: metricDelta(metric, baselineMetrics[id], baselineSelection.compatibility)
      };
    })
    .filter((entry): entry is MetricWithDelta => entry !== null);
};
