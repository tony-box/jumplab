import {
  validationCheckSchema,
  type ValidationCheck
} from "../../../../../packages/schema/src/index";

type FixtureProfile = {
  id: string;
  label: string;
  dt: number;
};

type FixtureOutcome = {
  status: "pass" | "fail" | "awaiting-core";
  measured: number;
  tolerance: number;
  unit: string;
};

type FixtureCheck = {
  id: string;
  category: "analytical" | "convergence" | "determinism" | "pending";
  label: string;
  description: string;
  traceRef?: string;
  owner?: string;
  blockedGate?: string;
  outcomes?: Record<string, FixtureOutcome>;
};

export type ValidationSuiteFixture = {
  version: number;
  source: "solver" | "representative-fixture";
  budgetMs: number;
  rowDelayMs: number;
  profiles: FixtureProfile[];
  disclosure: string;
  checks: FixtureCheck[];
  convergence: {
    title: string;
    axisLabel: string;
    rows: Array<{ dt: number; error: number; ratio: number | null; order: number | null }>;
  };
  determinism: {
    hashLines: string[];
  };
};

export type ValidationSuiteStatus = "idle" | "running" | "completed" | "failed" | "budget-exceeded";

export type ValidationSummary = {
  checks: number;
  passing: number;
  failing: number;
  awaitingCore: number;
  running: number;
  budgetExceeded: number;
  wallTimeMs: number;
};

export type ValidationSuiteSnapshot = {
  status: ValidationSuiteStatus;
  dt: number;
  profileLabel: string;
  source: "solver" | "representative-fixture";
  disclosure: string;
  details: Record<string, { description: string }>;
  rows: ValidationCheck[];
  convergence: ValidationSuiteFixture["convergence"];
  determinism: ValidationSuiteFixture["determinism"];
  summary: ValidationSummary;
  error: string | null;
};

export const REFERENCE_FIXTURE_DISCLOSURE =
  "These results are replayed from a recorded reference fixture (representative-fixture). They are not measured live in this browser; pending rows keep their owner and blocked gate until core evidence is available.";

export type ValidationRunCallback = (snapshot: ValidationSuiteSnapshot) => void;

const pause = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
};

const clampMillis = (value: number): number => {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 10) / 10;
};

const toMargin = (measured: number | null, tolerance: number | null): number | null => {
  if (measured === null || tolerance === null) return null;
  if (tolerance === 0) {
    return measured === 0 ? null : 0;
  }
  return tolerance / Math.max(measured, Number.EPSILON);
};

const findNearestProfile = (profiles: FixtureProfile[], dt: number): FixtureProfile => {
  return profiles.reduce((best, candidate) => {
    const bestDelta = Math.abs(best.dt - dt);
    const candidateDelta = Math.abs(candidate.dt - dt);
    return candidateDelta < bestDelta ? candidate : best;
  }, profiles[0] as FixtureProfile);
};

const cloneRows = (rows: ValidationCheck[]): ValidationCheck[] => rows.map((row) => ({ ...row }));

const buildIdleRows = (checks: FixtureCheck[], profileId: string): ValidationCheck[] => {
  return checks.map((check) => {
    if (check.category === "pending") {
      return validationCheckSchema.parse({
        id: check.id,
        category: check.category,
        label: check.label,
        measured: null,
        tolerance: null,
        margin: null,
        traceRef: null,
        owner: check.owner ?? null,
        blockedGate: check.blockedGate ?? null,
        status: "idle"
      });
    }

    const outcome = check.outcomes?.[profileId];
    if (!outcome) {
      return validationCheckSchema.parse({
        id: check.id,
        category: check.category,
        label: check.label,
        measured: null,
        tolerance: null,
        margin: null,
        traceRef: check.traceRef ?? null,
        owner: null,
        blockedGate: null,
        status: "idle"
      });
    }

    return validationCheckSchema.parse({
      id: check.id,
      category: check.category,
      label: check.label,
      measured: {
        value: outcome.measured,
        unit: outcome.unit
      },
      tolerance: {
        value: outcome.tolerance,
        unit: outcome.unit
      },
      margin: toMargin(outcome.measured, outcome.tolerance),
      traceRef: check.traceRef ?? null,
      owner: null,
      blockedGate: null,
      status: "idle"
    });
  });
};

export const reconcileValidationSummary = (
  rows: ValidationCheck[],
  wallTimeMs: number
): ValidationSummary => {
  const passing = rows.filter((row) => row.status === "pass").length;
  const failing = rows.filter((row) => row.status === "fail").length;
  const awaitingCore = rows.filter((row) => row.status === "awaiting-core").length;
  const running = rows.filter((row) => row.status === "running").length;
  const budgetExceeded = rows.filter((row) => row.status === "budget-exceeded").length;

  return {
    checks: passing + failing + awaitingCore,
    passing,
    failing,
    awaitingCore,
    running,
    budgetExceeded,
    wallTimeMs: clampMillis(wallTimeMs)
  };
};

const toSnapshot = (
  fixture: ValidationSuiteFixture,
  profile: FixtureProfile,
  status: ValidationSuiteStatus,
  rows: ValidationCheck[],
  wallTimeMs: number,
  error: string | null
): ValidationSuiteSnapshot => ({
  status,
  dt: profile.dt,
  profileLabel: profile.label,
  source: fixture.source,
  disclosure:
    fixture.source === "representative-fixture" ? REFERENCE_FIXTURE_DISCLOSURE : fixture.disclosure,
  details: Object.fromEntries(
    fixture.checks.map((check) => [check.id, { description: check.description }])
  ),
  rows: cloneRows(rows),
  convergence: fixture.convergence,
  determinism: fixture.determinism,
  summary: reconcileValidationSummary(rows, wallTimeMs),
  error
});

export const createValidationRunnerFromSuiteFixture = (fixture: ValidationSuiteFixture) => ({
  run: async (dt: number, onUpdate?: ValidationRunCallback): Promise<ValidationSuiteSnapshot> => {
    const profile = findNearestProfile(fixture.profiles, dt);
    const started = performance.now();
    const rows = buildIdleRows(fixture.checks, profile.id);

    let snapshot = toSnapshot(fixture, profile, "running", rows, 0, null);
    onUpdate?.(snapshot);

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row) continue;

      if (row.category === "pending") {
        row.status = "awaiting-core";
        snapshot = toSnapshot(fixture, profile, "running", rows, performance.now() - started, null);
        onUpdate?.(snapshot);
        continue;
      }

      row.status = "running";
      snapshot = toSnapshot(fixture, profile, "running", rows, performance.now() - started, null);
      onUpdate?.(snapshot);
      await pause(fixture.rowDelayMs);

      const check = fixture.checks.find((entry) => entry.id === row.id);
      const outcome = check?.outcomes?.[profile.id];

      if (outcome) {
        row.status = outcome.status;
        row.margin = toMargin(outcome.measured, outcome.tolerance);
      } else {
        row.status = "fail";
        row.margin = 0;
      }

      snapshot = toSnapshot(fixture, profile, "running", rows, performance.now() - started, null);
      onUpdate?.(snapshot);
    }

    snapshot = toSnapshot(fixture, profile, "completed", rows, performance.now() - started, null);
    onUpdate?.(snapshot);
    return snapshot;
  }
});

export type ValidationRunner = ReturnType<typeof createValidationRunnerFromSuiteFixture>;
