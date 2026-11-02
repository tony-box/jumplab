import { useMemo } from "react";
import { scaleLog } from "d3-scale";
import { line } from "d3-shape";

export type ConvergenceRow = {
  dt: number;
  error: number;
  ratio: number | null;
  order: number | null;
};

type ConvergenceChartProps = {
  rows: ConvergenceRow[];
  dataOdId?: string;
  tableOdId?: string;
  tableScrollOdId?: string;
  ariaLabel: string;
};

const EPSILON = 1e-12;

const formatDt = (dt: number): string => {
  if (!Number.isFinite(dt) || dt <= 0) return "-";
  return `1/${Math.round(1 / dt)}`;
};

const formatError = (value: number): string => {
  if (!Number.isFinite(value)) return "-";
  return value.toExponential(2);
};

const formatRatio = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) return "-";
  return value.toFixed(3);
};

const formatOrder = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) return "-";
  return value.toFixed(3);
};

export const ConvergenceChart = ({
  rows,
  dataOdId = "convergence-chart",
  tableOdId = "convergence-table",
  tableScrollOdId = "convergence-table-scroll",
  ariaLabel
}: ConvergenceChartProps) => {
  const cleanRows = useMemo(
    () =>
      rows
        .filter((row) => row.dt > 0 && row.error > 0)
        .slice()
        .sort((a, b) => b.dt - a.dt),
    [rows]
  );

  const width = 620;
  const height = 230;
  const margin = { top: 14, right: 18, bottom: 30, left: 56 };

  const plotRows =
    cleanRows.length > 0
      ? cleanRows
      : [
          { dt: 1 / 60, error: 1.4e-4, ratio: null, order: null },
          { dt: 1 / 960, error: 9.1e-6, ratio: null, order: null }
        ];

  const xMin = Math.min(...plotRows.map((row) => row.dt));
  const xMax = Math.max(...plotRows.map((row) => row.dt));
  const yMin = Math.min(...plotRows.map((row) => row.error));
  const yMax = Math.max(...plotRows.map((row) => row.error));

  const xScale = scaleLog()
    .domain([Math.max(xMin, EPSILON), Math.max(xMax, EPSILON)])
    .range([margin.left, width - margin.right]);

  const yScale = scaleLog()
    .domain([Math.max(yMin * 0.8, EPSILON), Math.max(yMax * 1.25, EPSILON)])
    .range([height - margin.bottom, margin.top]);

  const measuredLine = line<ConvergenceRow>()
    .x((row) => xScale(row.dt))
    .y((row) => yScale(row.error));

  const coarse = plotRows[0] as ConvergenceRow;
  const fine = plotRows[plotRows.length - 1] as ConvergenceRow;
  const slopeConstant = coarse.error / coarse.dt;
  const referenceRows: ConvergenceRow[] = [
    { dt: coarse.dt, error: slopeConstant * coarse.dt, ratio: null, order: null },
    { dt: fine.dt, error: slopeConstant * fine.dt, ratio: null, order: null }
  ];

  const xTicks = [xMax, xMax / 2, xMax / 4, xMin].filter(
    (value, index, source) => value >= xMin && value <= xMax && source.indexOf(value) === index
  );
  const yTicks = [yMax, Math.sqrt(yMax * yMin), yMin].filter(
    (value) => Number.isFinite(value) && value > 0
  );

  return (
    <div className="validation-convergence-grid">
      <article className="report-card" data-od-id={dataOdId}>
        <header>
          <h3>Projectile position error vs delta-t</h3>
          <span>log-log</span>
        </header>
        <div className="report-plot">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={ariaLabel}
          >
            <line
              x1={margin.left}
              y1={height - margin.bottom}
              x2={width - margin.right}
              y2={height - margin.bottom}
            />
            <line x1={margin.left} y1={margin.top} x2={margin.left} y2={height - margin.bottom} />

            {xTicks.map((tick) => (
              <g key={`x-${tick}`}>
                <line
                  x1={xScale(tick)}
                  x2={xScale(tick)}
                  y1={height - margin.bottom}
                  y2={height - margin.bottom + 4}
                  stroke="#77838d"
                />
                <text x={xScale(tick)} y={height - 8} textAnchor="middle">
                  {formatDt(tick)}
                </text>
              </g>
            ))}

            {yTicks.map((tick) => (
              <g key={`y-${tick}`}>
                <line
                  x1={margin.left - 4}
                  x2={margin.left}
                  y1={yScale(tick)}
                  y2={yScale(tick)}
                  stroke="#77838d"
                />
                <text x={margin.left - 8} y={yScale(tick) + 3} textAnchor="end">
                  {formatError(tick)}
                </text>
              </g>
            ))}

            <path
              d={measuredLine(referenceRows) ?? ""}
              fill="none"
              stroke="#9ea7ae"
              strokeWidth={2}
              strokeDasharray="6 5"
            />

            {cleanRows.length > 0 ? (
              <>
                <path
                  d={measuredLine(cleanRows) ?? ""}
                  fill="none"
                  stroke="#51b86a"
                  strokeWidth={2.4}
                />
                {cleanRows.map((row) => (
                  <circle
                    key={`point-${row.dt}`}
                    cx={xScale(row.dt)}
                    cy={yScale(row.error)}
                    r={3.6}
                    fill="#51b86a"
                    stroke="#1f6c34"
                  />
                ))}
              </>
            ) : null}

            <text x={width - margin.right} y={margin.top + 10} textAnchor="end">
              reference slope 1
            </text>
          </svg>
        </div>
      </article>

      <div className="report-card report-table" data-od-id={tableScrollOdId}>
        <table className="data-table" data-od-id={tableOdId}>
          <caption className="sr-only">Convergence sweep table equivalent</caption>
          <thead>
            <tr>
              <th scope="col">Delta-t</th>
              <th scope="col">Max position error</th>
              <th scope="col">Ratio</th>
              <th scope="col">Observed order</th>
            </tr>
          </thead>
          <tbody>
            {cleanRows.length === 0 ? (
              <tr>
                <th scope="row">No data</th>
                <td>-</td>
                <td>-</td>
                <td>-</td>
              </tr>
            ) : (
              cleanRows.map((row) => (
                <tr key={`table-${row.dt}`}>
                  <th scope="row">{formatDt(row.dt)} s</th>
                  <td>{formatError(row.error)} m</td>
                  <td>{formatRatio(row.ratio)}</td>
                  <td>{formatOrder(row.order)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
