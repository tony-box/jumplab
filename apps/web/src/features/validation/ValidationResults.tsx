import { AlertCircle } from "lucide-react";

import type { ValidationCheck } from "../../../../../packages/schema/src/index";
import { ConvergenceChart, type ConvergenceRow } from "../../rendering/charts/ConvergenceChart";
import type { ValidationSuiteSnapshot } from "./validation-runner";

type ValidationResultsProps = {
  snapshot: ValidationSuiteSnapshot;
};

const statusLabel = (status: ValidationCheck["status"]): string => {
  if (status === "awaiting-core") return "awaiting core";
  if (status === "budget-exceeded") return "budget exceeded";
  return status;
};

const formatMeasured = (row: ValidationCheck): string => {
  if (!row.measured) return "-";
  return `${row.measured.value.toExponential(2)} ${row.measured.unit}`;
};

const formatTolerance = (row: ValidationCheck): string => {
  if (!row.tolerance) return "-";
  if (row.tolerance.value === 0) return `exact (${row.tolerance.unit})`;
  return `${row.tolerance.value.toExponential(2)} ${row.tolerance.unit}`;
};

const formatMargin = (row: ValidationCheck): string => {
  if (row.margin === null) return "-";
  return `${row.margin.toFixed(2)}x`;
};

const analyticalRows = (rows: ValidationCheck[]): ValidationCheck[] =>
  rows.filter((row) => row.category === "analytical");

const determinismRows = (rows: ValidationCheck[]): ValidationCheck[] =>
  rows.filter((row) => row.category === "determinism");

const pendingRows = (rows: ValidationCheck[]): ValidationCheck[] =>
  rows.filter((row) => row.category === "pending");

const toConvergenceRows = (rows: ConvergenceRow[]): ConvergenceRow[] => rows;

export const ValidationResults = ({ snapshot }: ValidationResultsProps) => {
  const analytical = analyticalRows(snapshot.rows);
  const determinism = determinismRows(snapshot.rows);
  const pending = pendingRows(snapshot.rows);

  return (
    <>
      <h2 className="section-heading" data-od-id="sec-analytical">
        Analytical checks
      </h2>
      <div className="report-card report-table" data-od-id="analytical-table-scroll">
        <table className="data-table" data-od-id="analytical-table">
          <caption className="sr-only">
            Analytical validation checks with tolerance, margin, and trace links
          </caption>
          <thead>
            <tr>
              <th scope="col">Check</th>
              <th scope="col">Measured</th>
              <th scope="col">Tolerance</th>
              <th scope="col">Margin</th>
              <th scope="col">Trace</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {analytical.map((row) => (
              <tr key={row.id} data-od-id={`validation-row-${row.id}`}>
                <th scope="row">
                  {row.label}
                  <span className="validation-desc">
                    {snapshot.details[row.id]?.description ?? ""}
                  </span>
                </th>
                <td>{formatMeasured(row)}</td>
                <td>{formatTolerance(row)}</td>
                <td>{formatMargin(row)}</td>
                <td>
                  {row.traceRef ? (
                    <a
                      data-od-id={`trace-${row.id}`}
                      href={row.traceRef}
                      onClick={(event) => event.preventDefault()}
                    >
                      trace
                    </a>
                  ) : (
                    "-"
                  )}
                </td>
                <td data-column="status">
                  <span className={`validation-status status-${row.status}`}>
                    {statusLabel(row.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section-heading" data-od-id="sec-convergence">
        Timestep convergence
      </h2>
      <ConvergenceChart
        rows={toConvergenceRows(snapshot.convergence.rows)}
        ariaLabel="Convergence of position error against timestep"
      />
      <p className="validation-note" data-od-id="convergence-note">
        <AlertCircle aria-hidden="true" />
        <span>
          <strong>Order is the acceptance criterion, not absolute error.</strong> A first-order
          integrator should preserve an observed order near 1.0 as delta-t halves.
        </span>
      </p>

      <h2 className="section-heading" data-od-id="sec-determinism">
        Determinism
      </h2>
      <div className="validation-two-column">
        <div className="report-card">
          <pre className="validation-hashbox" data-od-id="determinism-hashes">
            {snapshot.determinism.hashLines.join("\n")}
          </pre>
        </div>
        <div className="report-card report-table">
          <table className="data-table" data-od-id="determinism-table">
            <caption className="sr-only">Determinism properties and status</caption>
            <thead>
              <tr>
                <th scope="col">Property</th>
                <th scope="col">Result</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {determinism.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.label}</th>
                  <td>{row.measured ? `${row.measured.value} ${row.measured.unit}` : "-"}</td>
                  <td>
                    <span className={`validation-status status-${row.status}`}>
                      {statusLabel(row.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="section-heading" data-od-id="sec-pending">
        Awaiting the solver core
      </h2>
      <div className="report-card report-table" data-od-id="pending-table-scroll">
        <table className="data-table" data-od-id="pending-table">
          <caption className="sr-only">Pending validation gates and owner disclosure</caption>
          <thead>
            <tr>
              <th scope="col">Check</th>
              <th scope="col">Owner</th>
              <th scope="col">Gate</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((row) => (
              <tr key={row.id}>
                <th scope="row">
                  {row.label}
                  <span className="validation-desc">
                    {snapshot.details[row.id]?.description ?? ""}
                  </span>
                </th>
                <td data-column="owner">{row.owner ?? "-"}</td>
                <td data-column="gate">{row.blockedGate ?? "-"}</td>
                <td data-column="status">
                  <span className={`validation-status status-${row.status}`}>
                    {statusLabel(row.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};
