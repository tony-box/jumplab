import { useMemo } from "react";
import { scaleLinear } from "d3-scale";
import { area, line } from "d3-shape";

export type RunChartPoint = {
  x: number;
  y: number;
};

export type RunChartSeries = {
  id: string;
  label: string;
  color: string;
  points: RunChartPoint[];
  dashed?: boolean;
  fillAlpha?: number;
};

type RunChartProps = {
  dataOdId?: string;
  title: string;
  xLabel: string;
  yLabel: string;
  ariaLabel: string;
  series: RunChartSeries[];
};

type Extent = { min: number; max: number };

const clampExtent = (extent: Extent): Extent => {
  if (!Number.isFinite(extent.min) || !Number.isFinite(extent.max)) {
    return { min: 0, max: 1 };
  }
  if (extent.min === extent.max) {
    return { min: extent.min - 1, max: extent.max + 1 };
  }
  return extent;
};

const toExtent = (values: number[]): Extent => {
  if (values.length === 0) {
    return { min: 0, max: 1 };
  }
  return {
    min: Math.min(...values),
    max: Math.max(...values)
  };
};

const sampleEvery = (points: RunChartPoint[], maxPoints = 200): RunChartPoint[] => {
  if (points.length <= maxPoints) {
    return points;
  }
  const step = Math.max(1, Math.floor(points.length / maxPoints));
  const sampled = points.filter((_point, index) => index % step === 0);
  const last = points[points.length - 1];
  if (last && sampled[sampled.length - 1] !== last) {
    sampled.push(last);
  }
  return sampled;
};

export const RunChart = ({ dataOdId, title, xLabel, yLabel, ariaLabel, series }: RunChartProps) => {
  const sampled = useMemo(
    () => series.map((entry) => ({ ...entry, points: sampleEvery(entry.points) })),
    [series]
  );

  const xValues = sampled.flatMap((entry) => entry.points.map((point) => point.x));
  const yValues = sampled.flatMap((entry) => entry.points.map((point) => point.y));

  const xExtent = clampExtent(toExtent(xValues));
  const yExtent = clampExtent(toExtent(yValues));
  const yPadding = Math.max(0.1, (yExtent.max - yExtent.min) * 0.08);

  const width = 620;
  const height = 220;
  const left = 44;
  const right = 14;
  const top = 12;
  const bottom = 28;

  const xScale = scaleLinear()
    .domain([xExtent.min, xExtent.max])
    .range([left, width - right]);
  const yScale = scaleLinear()
    .domain([yExtent.min - yPadding, yExtent.max + yPadding])
    .range([height - bottom, top]);

  const lineFactory = line<RunChartPoint>()
    .x((point) => xScale(point.x))
    .y((point) => yScale(point.y));

  const areaFactory = area<RunChartPoint>()
    .x((point) => xScale(point.x))
    .y0(height - bottom)
    .y1((point) => yScale(point.y));

  return (
    <article className="report-card" data-od-id={dataOdId}>
      <header>
        <h2>{title}</h2>
        <span>
          {yLabel} / {xLabel}
        </span>
      </header>
      <div className="report-plot">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={ariaLabel}
        >
          <line x1={left} y1={height - bottom} x2={width - right} y2={height - bottom} />
          <line x1={left} y1={top} x2={left} y2={height - bottom} />

          {sampled.map((entry) => {
            if (entry.points.length === 0) {
              return null;
            }
            const path = lineFactory(entry.points) ?? "";
            const fill = areaFactory(entry.points) ?? "";
            return (
              <g key={entry.id}>
                {entry.fillAlpha ? (
                  <path d={fill} fill={entry.color} opacity={entry.fillAlpha} />
                ) : null}
                <path
                  d={path}
                  fill="none"
                  stroke={entry.color}
                  strokeWidth={2.2}
                  strokeDasharray={entry.dashed ? "5 4" : undefined}
                />
              </g>
            );
          })}

          <text x={left} y={height - 10}>
            {xExtent.min.toFixed(1)}
          </text>
          <text x={width - right} y={height - 10} textAnchor="end">
            {xExtent.max.toFixed(1)}
          </text>
          <text x={left - 4} y={top + 8} textAnchor="end">
            {(yExtent.max + yPadding).toFixed(1)}
          </text>
        </svg>
      </div>

      <div className="report-chart-table" data-od-id={dataOdId ? `${dataOdId}-table` : undefined}>
        <table className="data-table">
          <caption className="sr-only">{title} table equivalent</caption>
          <thead>
            <tr>
              <th scope="col">Series</th>
              <th scope="col">Start</th>
              <th scope="col">Mid</th>
              <th scope="col">End</th>
            </tr>
          </thead>
          <tbody>
            {sampled.map((entry) => {
              const first = entry.points[0];
              const mid = entry.points[Math.floor(entry.points.length / 2)];
              const last = entry.points[entry.points.length - 1];
              return (
                <tr key={`table-${entry.id}`}>
                  <th scope="row">{entry.label}</th>
                  <td>{first ? `${first.y.toFixed(2)}` : "-"}</td>
                  <td>{mid ? `${mid.y.toFixed(2)}` : "-"}</td>
                  <td>{last ? `${last.y.toFixed(2)}` : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </article>
  );
};
