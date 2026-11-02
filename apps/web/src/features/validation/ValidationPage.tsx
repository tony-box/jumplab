import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Play } from "lucide-react";
import { Link } from "react-router";

import { AppShell } from "../../components/ui";
import { selectSessionState, selectStoreActions, useAppStore } from "../../state/store";
import { registerValidationTestControls } from "../../test-hooks";
import { useAppServices } from "../../app/AppProviders";
import {
  REFERENCE_FIXTURE_DISCLOSURE,
  type ValidationSuiteSnapshot,
  type ValidationSuiteStatus
} from "./validation-runner";
import { ValidationResults } from "./ValidationResults";

const TIMESTEP_OPTIONS = [
  { label: "1/960 s (shipped)", value: 1 / 960 },
  { label: "1/480 s", value: 1 / 480 },
  { label: "1/240 s", value: 1 / 240 },
  { label: "1/120 s", value: 1 / 120 },
  { label: "1/60 s", value: 1 / 60 }
];

const initialSnapshot = (dt: number): ValidationSuiteSnapshot => ({
  status: "idle",
  dt,
  profileLabel: "not run",
  source: "representative-fixture",
  disclosure: REFERENCE_FIXTURE_DISCLOSURE,
  details: {},
  rows: [],
  convergence: {
    title: "Projectile position error vs delta-t",
    axisLabel: "log-log",
    rows: []
  },
  determinism: {
    hashLines: []
  },
  summary: {
    checks: 0,
    passing: 0,
    failing: 0,
    awaitingCore: 0,
    running: 0,
    budgetExceeded: 0,
    wallTimeMs: 0
  },
  error: null
});

const shellStatus = (status: ValidationSuiteStatus): string => {
  if (status === "running") return "running validation";
  if (status === "completed") return "validation complete";
  if (status === "failed") return "validation failed";
  if (status === "budget-exceeded") return "budget exceeded";
  return "idle";
};

export const ValidationPage = () => {
  const services = useAppServices();
  const actions = useAppStore(selectStoreActions);
  const session = useAppStore(selectSessionState);

  const defaultDt = useMemo(() => {
    const fromSession = session.view.validationDt;
    return (
      TIMESTEP_OPTIONS.find((option) => Math.abs(option.value - fromSession) < 1e-12)?.value ??
      1 / 240
    );
  }, [session.view.validationDt]);

  const [dt, setDt] = useState<number>(defaultDt);
  const [running, setRunning] = useState(false);
  const [snapshot, setSnapshot] = useState<ValidationSuiteSnapshot>(() =>
    initialSnapshot(defaultDt)
  );

  useEffect(() => {
    actions.setRoute("/validation");
  }, [actions]);

  useEffect(() => {
    actions.setViewPreference("validationDt", dt);
  }, [actions, dt]);

  useEffect(
    () =>
      registerValidationTestControls({
        getCheckpoint: () => ({
          status: snapshot.status,
          checks: snapshot.summary.checks,
          passing: snapshot.summary.passing,
          failing: snapshot.summary.failing,
          awaitingCore: snapshot.summary.awaitingCore,
          running: snapshot.summary.running,
          rowCount: snapshot.rows.length,
          hashLineCount: snapshot.determinism.hashLines.length
        })
      }),
    [snapshot]
  );

  const runSuite = useCallback(async () => {
    setRunning(true);
    try {
      const result = await services.validationRunner.run(dt, (update) => {
        setSnapshot(update);
      });
      setSnapshot(result);
    } catch (error) {
      setSnapshot((previous) => ({
        ...previous,
        status: "failed",
        error: error instanceof Error ? error.message : "Validation suite failed unexpectedly"
      }));
    } finally {
      setRunning(false);
    }
  }, [dt, services.validationRunner]);

  const settledRows = snapshot.summary.checks;
  const rowTotal = Math.max(1, snapshot.rows.length);
  const progressValue = snapshot.status === "completed" ? 1 : Math.min(1, settledRows / rowTotal);
  const showProgress = running || snapshot.status !== "idle";

  return (
    <AppShell
      scenarioLabel="Validation suite"
      status={shellStatus(snapshot.status)}
      source={snapshot.source}
      contextSlot={
        <div className="validation-context">
          <label htmlFor="validation-timestep">Timestep</label>
          <select
            id="validation-timestep"
            aria-label="Solver timestep"
            data-od-id="timestep-select"
            value={String(dt)}
            disabled={running}
            onChange={(event) => {
              setDt(Number(event.target.value));
            }}
          >
            {TIMESTEP_OPTIONS.map((option) => (
              <option key={option.label} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      }
      primaryLabel={running ? "Running suite..." : "Run suite"}
      primaryId="run-suite"
      primaryIcon={<Play aria-hidden="true" />}
      primaryDisabled={running}
      onPrimary={() => void runSuite()}
    >
      <main className="validation-page" data-od-id="validation-page" tabIndex={0}>
        <header className="validation-header">
          <h1>Validation suite</h1>
          <p data-od-id="validation-disclosure" data-source={snapshot.source}>
            {snapshot.disclosure}
          </p>
          <Link className="btn" to="/designer">
            Open Designer
          </Link>
        </header>

        <section
          className="validation-summary"
          data-od-id="suite-summary"
          data-suite-status={snapshot.status}
        >
          <article>
            <span>Checks</span>
            <strong className="num" data-od-id="summary-checks">
              {snapshot.summary.checks}
            </strong>
          </article>
          <article>
            <span>Passing</span>
            <strong className="num pass" data-od-id="summary-passing">
              {snapshot.summary.passing}
            </strong>
          </article>
          <article>
            <span>Failing</span>
            <strong className="num fail" data-od-id="summary-failing">
              {snapshot.summary.failing}
            </strong>
          </article>
          <article>
            <span>Awaiting core</span>
            <strong className="num" data-od-id="summary-awaiting-core">
              {snapshot.summary.awaitingCore}
            </strong>
          </article>
          <article>
            <span>Running</span>
            <strong className="num" data-od-id="summary-running">
              {snapshot.summary.running}
            </strong>
          </article>
          <article>
            <span>Replay time</span>
            <strong className="num" data-od-id="summary-wall-time">
              {snapshot.summary.wallTimeMs.toFixed(1)} ms
            </strong>
          </article>
        </section>

        {showProgress ? (
          <div
            className="validation-progress"
            data-od-id="validation-progress"
            role="status"
            aria-live="polite"
          >
            <span>
              {running
                ? `Running suite: ${snapshot.summary.checks}/${snapshot.rows.length || 0} checks settled`
                : `${shellStatus(snapshot.status)}: ${snapshot.summary.checks}/${snapshot.rows.length || 0} checks settled`}
            </span>
            <progress max={1} value={progressValue} />
          </div>
        ) : null}

        {snapshot.status === "failed" || snapshot.status === "budget-exceeded" ? (
          <div
            className="validation-recovery"
            data-od-id="validation-recovery"
            role="status"
            aria-live="polite"
          >
            <AlertTriangle aria-hidden="true" />
            <p>
              {snapshot.status === "failed"
                ? `Validation failed: ${snapshot.error ?? "the suite could not complete"}`
                : "Validation budget exceeded before all runnable checks settled."}
            </p>
          </div>
        ) : null}

        <ValidationResults snapshot={snapshot} />
      </main>
    </AppShell>
  );
};
