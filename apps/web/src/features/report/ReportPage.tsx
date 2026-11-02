import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";

import { hashScenario, type RunArtifact } from "../../../../../packages/schema/src/index";
import { useAppServices } from "../../app/AppProviders";
import type { RunArtifactRepository } from "../../app/services";
import { AppShell, Button, StaleReference } from "../../components/ui";
import {
  selectRunState,
  selectSessionState,
  selectStoreActions,
  useAppStore
} from "../../state/store";
import { registerReportTestControls } from "../../test-hooks";
import { ReportHeader } from "./ReportHeader";
import { ReportResults } from "./ReportResults";
import {
  cloneScenarioSnapshotForWorkbench,
  compareArtifactsConservative,
  loadRouteArtifact,
  resolveStaleRunReference
} from "./report-service";

const downloadCsv = (runId: string, csv: string): void => {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `jump-lab-run-${runId}.csv`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

type ReportLoadState = "loading" | "ready" | "missing" | "legacy" | "error";

const statusLabel = (state: ReportLoadState): string => {
  if (state === "loading") return "loading report";
  if (state === "ready") return "report ready";
  if (state === "legacy") return "legacy run";
  if (state === "error") return "report unreadable";
  return "missing run";
};

export const ReportPage = () => {
  const navigate = useNavigate();
  const params = useParams<{ runId?: string }>();
  const services = useAppServices();
  const actions = useAppStore(selectStoreActions);
  const runState = useAppStore(selectRunState);
  const sessionState = useAppStore(selectSessionState);

  const [loadingState, setLoadingState] = useState<ReportLoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [current, setCurrent] = useState<RunArtifact | null>(null);
  const [baseline, setBaseline] = useState<RunArtifact | null>(null);
  const [runs, setRuns] = useState<Awaited<ReturnType<typeof services.runArtifactRepository.list>>>(
    []
  );
  const [selectedBaselineRunId, setSelectedBaselineRunId] = useState<string>(
    sessionState.view.reportBaselineRunId
  );
  const [surfaceError, setSurfaceError] = useState<string | null>(null);

  const routeRunId = params.runId ?? "";

  useEffect(() => {
    if (!params.runId) {
      const activeRunId = runState.active?.runId;
      if (activeRunId) {
        navigate(`/report/${activeRunId}`, { replace: true });
      }
    }
  }, [navigate, params.runId, runState.active?.runId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!routeRunId) {
        setLoadingState("missing");
        setCurrent(null);
        return;
      }

      setLoadingState("loading");
      setLoadError(null);
      setSurfaceError(null);

      const [listedResult, loadedResult] = await Promise.allSettled([
        services.runArtifactRepository.list(),
        loadRouteArtifact({ routeRunId, repository: services.runArtifactRepository })
      ]);

      if (!active) {
        return;
      }

      const listedRuns: Awaited<ReturnType<RunArtifactRepository["list"]>> =
        listedResult.status === "fulfilled" ? listedResult.value : [];
      setRuns(listedRuns);

      if (loadedResult.status === "rejected") {
        const error: unknown = loadedResult.reason;
        setCurrent(null);
        setLoadError(
          error instanceof Error ? error.message : "The stored run record could not be read"
        );
        setLoadingState("error");
        return;
      }

      const loaded = loadedResult.value;

      if (loaded.state === "ready" && loaded.artifact) {
        setCurrent(loaded.artifact);
        setLoadingState("ready");
        actions.setViewPreference("reportRunId", loaded.artifact.runId);
        actions.clearStaleReference("run", loaded.artifact.runId);
        return;
      }

      setCurrent(null);
      setLoadingState(loaded.state);
      if (loaded.staleReference) {
        actions.markStaleReference({
          ...loaded.staleReference,
          stale: true
        });
      }
    })();

    return () => {
      active = false;
    };
  }, [actions, routeRunId, services.runArtifactRepository]);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!current || !selectedBaselineRunId) {
        setBaseline(null);
        return;
      }

      let artifact: RunArtifact | null = null;
      try {
        artifact = await services.runArtifactRepository.get(selectedBaselineRunId);
      } catch (error) {
        if (active) {
          setSurfaceError(
            error instanceof Error
              ? `Baseline run could not be read: ${error.message}`
              : "Baseline run could not be read"
          );
        }
      }
      if (!active) {
        return;
      }
      setBaseline(artifact);
    })();

    return () => {
      active = false;
    };
  }, [current, selectedBaselineRunId, services.runArtifactRepository]);

  useEffect(() => {
    actions.setRoute(routeRunId ? `/report/${routeRunId}` : "/report");
  }, [actions, routeRunId]);

  useEffect(() => {
    actions.setViewPreference("reportBaselineRunId", selectedBaselineRunId);
  }, [actions, selectedBaselineRunId]);

  useEffect(
    () =>
      registerReportTestControls({
        selectRun: (runId) => navigate(`/report/${runId}`),
        selectBaseline: (runId) => setSelectedBaselineRunId(runId),
        getCheckpoint: () => ({
          runId: routeRunId,
          baselineRunId: selectedBaselineRunId,
          chartCount: document.querySelectorAll('[data-od-id="charts"] svg path').length
        })
      }),
    [navigate, routeRunId, selectedBaselineRunId]
  );

  const comparison = useMemo(
    () => compareArtifactsConservative(current, baseline),
    [baseline, current]
  );

  const openInWorkbench = async () => {
    if (!current) {
      return;
    }

    const cloned = cloneScenarioSnapshotForWorkbench(current);
    const hash = await hashScenario(cloned.scenario);
    actions.setScenarioFromSnapshot(cloned.scenario, hash, cloned.provenance.originRunId);
    actions.setRoute("/workbench");
    navigate("/workbench");
  };

  const exportCsv = () => {
    if (!current) {
      return;
    }

    try {
      const csv = services.frameExporter.exportCsv(current);
      downloadCsv(current.runId, csv);
    } catch (error) {
      setSurfaceError(error instanceof Error ? error.message : "CSV export failed");
    }
  };

  const fallbackRun = runs.find((run) => run.runId !== routeRunId) ?? null;
  const stale = resolveStaleRunReference(Object.values(sessionState.staleReferences), routeRunId);

  return (
    <AppShell
      scenarioLabel={current?.scenarioSnapshot.name ?? "Run report"}
      status={statusLabel(loadingState)}
      source={current?.source ?? "solver"}
      primaryLabel="Open in workbench"
      primaryId="open-workbench"
      primaryIcon={<ArrowLeft aria-hidden="true" />}
      primaryDisabled={!current}
      onPrimary={() => void openInWorkbench()}
    >
      <main className="report-wrap" data-od-id="report-page">
        <div className="report-actions">
          <Link className="btn" to="/designer">
            Open Designer
          </Link>
          <Button
            id="export-csv"
            data-od-id="export-csv"
            icon={<Download aria-hidden="true" />}
            onClick={exportCsv}
            disabled={!current}
          >
            Export frames CSV
          </Button>
        </div>

        {loadingState === "loading" ? <p>Loading report...</p> : null}

        {loadingState === "error" ? (
          <section className="report-error" data-od-id="report-error" role="alert">
            <h2>This run report could not be opened</h2>
            <p>
              The stored record for run <code>{routeRunId}</code> is corrupt or unreadable
              {loadError ? `: ${loadError}` : "."}
            </p>
            <div className="report-actions">
              <Link className="btn" to="/workbench">
                Back to workbench
              </Link>
              {fallbackRun ? (
                <Link className="btn" to={`/report/${fallbackRun.runId}`}>
                  Open latest run
                </Link>
              ) : null}
            </div>
          </section>
        ) : null}

        {loadingState !== "ready" && loadingState !== "error" ? (
          <section data-od-id={loadingState === "legacy" ? "report-legacy" : "report-missing"}>
            {stale ? (
              <StaleReference
                kind={stale.kind}
                label={stale.label}
                reason={stale.reason}
                onClear={() => {
                  actions.clearStaleReference(stale.kind, stale.id);
                  navigate("/report");
                }}
                onReplace={
                  runs.length > 0
                    ? () => {
                        const replacement = runs[0];
                        if (!replacement) {
                          return;
                        }
                        actions.replaceStaleReference(stale.kind, stale.id, {
                          kind: "run",
                          id: replacement.runId,
                          label: `Run ${replacement.runId.slice(0, 8)}`,
                          reason: "User selected replacement run",
                          stale: true
                        });
                        navigate(`/report/${replacement.runId}`);
                      }
                    : undefined
                }
              />
            ) : (
              <p>Run reference is unavailable in this session. Clear or replace to continue.</p>
            )}
          </section>
        ) : null}

        {current ? (
          <>
            <ReportHeader
              runs={runs}
              selectedRunId={current.runId}
              selectedBaselineRunId={selectedBaselineRunId}
              current={current}
              comparison={comparison}
              onSelectRun={(runId) => navigate(`/report/${runId}`)}
              onSelectBaseline={(runId) => setSelectedBaselineRunId(runId)}
              disabled={loadingState !== "ready"}
            />

            <ReportResults run={current} baseline={baseline} comparison={comparison} />
          </>
        ) : null}

        {surfaceError ? <p className="report-warning">{surfaceError}</p> : null}
      </main>
    </AppShell>
  );
};
