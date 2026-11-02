export type ChartSeriesPoint = {
  x: number;
  y: number;
};

export type ChartSeries = {
  id: string;
  label: string;
  unit: string;
  points: ChartSeriesPoint[];
};

export * from "./RunChart";
export * from "./ConvergenceChart";
