import type {
  BaselineSelection,
  LandingOutcome,
  Metric,
  RunArtifact,
  RunResult
} from "../../../../../packages/schema/src/index";

export type MetricGroupId = "takeoff" | "air" | "landing" | "rider" | "energy";

export type MetricWithDelta = {
  id: string;
  label: string;
  metric: Metric;
  delta: number | null;
};

/** Display order and wording for the solver's metrics, grouped by jump phase. */
const metricGroups: Record<MetricGroupId, Array<[id: string, label: string]>> = {
  takeoff: [
    ["takeoffSpeed", "Speed"],
    ["takeoffAngle", "Launch angle"]
  ],
  air: [
    ["airtime", "Airtime"],
    ["jumpDistance", "Distance"],
    ["maxHeightAboveLip", "Peak above lip"],
    ["airRotation", "Bike rotation"]
  ],
  landing: [
    ["landingX", "Touchdown x"],
    ["sweetSpotOffset", "From sweet spot"],
    ["landingPitchError", "Pitch vs slope"],
    ["landingImpulse", "Impulse (0.2 s)"],
    ["landingForce", "Average force"],
    ["peakNormalForce", "Peak force"]
  ],
  rider: [
    ["actuatorWorkPositive", "Work in"],
    ["actuatorWorkNegative", "Work absorbed"],
    ["trackingError", "Pose tracking"],
    ["instinctPeakAngle", "Instinct lean"],
    ["instinctPeakOffset", "Instinct shift"],
    ["instinctSaturatedTime", "Instinct maxed"]
  ],
  energy: [
    ["energyResidual", "Balance error"],
    ["impactEnergyLoss", "Lost on impact"]
  ]
};

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
  return metricGroups[group].flatMap(([id, label]) => {
    const metric = result.metrics[id];
    if (!metric) return [];
    return [
      {
        id,
        label,
        metric,
        delta: metricDelta(metric, baselineMetrics[id], baselineSelection.compatibility)
      }
    ];
  });
};

export type OutcomeTone = "clean" | "caution" | "crash" | "none";

export type OutcomeSummary = {
  tone: OutcomeTone;
  title: string;
  detail: string;
  reasons: string[];
};

const regionTitle: Record<NonNullable<LandingOutcome["region"]>, string> = {
  case: "Cased",
  early: "Early on the landing",
  "sweet-spot": "Sweet spot",
  late: "Late on the landing",
  overshoot: "Overshot"
};

const statusTitle: Record<Exclude<LandingOutcome["status"], "landed">, string> = {
  "no-flight": "Never left the ground",
  stalled: "Ran out of speed",
  "airborne-at-end": "Still airborne at the end"
};

/** One-line verdict for a run: where it landed, how it landed, and whether the rider crashed. */
export const summarizeLanding = (landing: LandingOutcome): OutcomeSummary => {
  if (landing.status !== "landed") {
    return {
      tone: landing.severity === "crash" ? "crash" : "none",
      title: statusTitle[landing.status],
      detail: landing.severity === "crash" ? "Crashed" : "",
      reasons: landing.reasons
    };
  }
  const attitude =
    landing.attitude === "balanced"
      ? "Balanced"
      : landing.attitude === "nose-heavy"
        ? "Nose-heavy"
        : landing.attitude === "tail-heavy"
          ? "Tail-heavy"
          : "Attitude unknown";
  const firstContact =
    landing.firstContact === "both"
      ? "both wheels together"
      : `${landing.firstContact ?? "rear"} wheel first`;
  const clean =
    landing.severity === "clean" &&
    landing.attitude === "balanced" &&
    (landing.region === "sweet-spot" || landing.region === "early" || landing.region === "late");
  return {
    tone: landing.severity === "crash" ? "crash" : clean ? "clean" : "caution",
    title: landing.severity === "crash" ? "Crashed" : regionTitle[landing.region ?? "late"],
    detail: [
      landing.severity === "crash" ? regionTitle[landing.region ?? "late"] : null,
      attitude,
      firstContact
    ]
      .filter(Boolean)
      .join(" · "),
    reasons: landing.reasons
  };
};
