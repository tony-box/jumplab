import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";

import { hashScenario, type RunArtifact } from "../../../../../packages/schema/src/index";
import { useAppServices } from "../../app/AppProviders";
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
  URL.revokeObjectURL(url);
};

const statusLabel = (state: "loading" | "ready" | "missing" | "legacy"): string => {
  if (state === "loading") return "loading report";
  if (state === "ready") return "report ready";
  if (state === "legacy") return "legacy run";
  return "missing run";
};

export const ReportPage = () => {
  const navigate = useNavigate();
  const params = useParams<{ runId?: string }>();
  const services = useAppServices();
  const actions = useAppStore(selectStoreActions);
  const runState = useAppStore(selectRunState);
  const sessionState = useAppStore(selectSessionState);

  const [loadingState, setLoadingState] = useState<"loading" | "ready" | "missing" | "legacy">(
    "loading"
  );
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
      setSurfaceError(null);

      const [listedRuns, loaded] = await Promise.all([
        services.runArtifactRepository.list(),
        loadRouteArtifact({ routeRunId, repository: services.runArtifactRepository })
      ]);

      if (!active) {
        return;
      }

      setRuns(listedRuns);

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

      const artifact = await services.runArtifactRepository.get(selectedBaselineRunId);
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

        {loadingState !== "ready" ? (
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
