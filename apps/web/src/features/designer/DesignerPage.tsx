import { useEffect, useState } from "react";
import { Check } from "lucide-react";

import { AppShell, Callout } from "../../components/ui";
import { registerDesignerTestControls } from "../../test-hooks";
import { BikeDerivedRail } from "./BikeDerivedRail";
import { BikeGeometryRail } from "./BikeGeometryRail";
import { DistanceTrack } from "./DistanceTrack";
import { JointRail } from "./JointRail";
import { KeyframeRail } from "./KeyframeRail";
import { DesignerStage } from "./DesignerStage";
import { useBikeDesigner } from "./useBikeDesigner";
import { useDesignerEditor } from "./useDesignerEditor";

export const DesignerPage = () => {
  const editor = useDesignerEditor();
  const bikeDesigner = useBikeDesigner(editor.scenario);
  const [mode, setMode] = useState<"bike" | "pose">("pose");

  useEffect(() => {
    document.title = "Bike and Pose Designer | Jump Lab";
  }, []);

  useEffect(
    () =>
      registerDesignerTestControls(() => {
        const pose = editor.checkpoint;
        return {
          ...pose,
          activeRoute: "/designer",
          mode,
          geometryRequestId: bikeDesigner.requestId,
          geometryStatus: bikeDesigner.status,
          geometry: bikeDesigner.inspection,
          draftValid: bikeDesigner.status === "valid",
          geometryIssueCodes: bikeDesigner.issues.map((issue) => issue.code)
        };
      }),
    [bikeDesigner, editor.checkpoint, mode]
  );
  const poseConflicts = editor.designValidation?.poseKeys.flatMap((key) => key.conflicts) ?? [];
  const allConflicts = poseConflicts.filter(
    (conflict, index, conflicts) =>
      conflicts.findIndex(
        (candidate) =>
          candidate.code === conflict.code &&
          candidate.keyIndex === conflict.keyIndex &&
          candidate.riderPart === conflict.riderPart &&
          candidate.bikePart === conflict.bikePart
      ) === index
  );
  const affectedKeyCount = new Set(
    poseConflicts.flatMap((conflict) => (conflict.keyIndex === null ? [] : [conflict.keyIndex]))
  ).size;
  const applyDisabledReason =
    mode === "bike" && bikeDesigner.status === "pending"
      ? "Apply disabled while bike geometry inspection is pending"
      : mode === "bike" && bikeDesigner.status === "invalid"
        ? `Apply disabled: ${bikeDesigner.issues.length} blocking bike geometry issues`
        : mode === "bike" && bikeDesigner.status === "error"
          ? `Apply disabled: ${bikeDesigner.error ?? "bike geometry inspection unavailable"}`
          : editor.applyDisabledReason;
  const visibleApplyDisabledReason =
    mode === "pose" && editor.validationPending ? null : applyDisabledReason;

  if (!editor.initialized || !editor.scenario || !editor.selectedKey) {
    return (
      <AppShell
        scenarioLabel="Designer"
        status={editor.statusLabel}
        source={editor.source}
        primaryLabel="Apply to run"
        primaryId="apply-clip"
        primaryIcon={<Check aria-hidden="true" />}
        primaryDisabled
        onPrimary={() => undefined}
      >
        <main className="placeholder-page" data-od-id="designer-page">
          <div data-od-id="pose-page">
            <Callout title="Preparing Designer" tone="info">
              Loading the active scenario and Designer capabilities.
            </Callout>
            {editor.surfaceError ? (
              <Callout title="Designer unavailable" tone="warning">
                {editor.surfaceError}
              </Callout>
            ) : null}
          </div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell
      scenarioLabel={editor.scenario.poseClip.name}
      status={editor.saturated ? "stale constrained" : editor.statusLabel}
      source={editor.source}
      primaryLabel="Apply to run"
      primaryId="apply-clip"
      primaryIcon={<Check aria-hidden="true" />}
      primaryDisabled={Boolean(applyDisabledReason)}
      onPrimary={editor.applyToRun}
    >
      <main className="pose-page" data-od-id="designer-page">
        <div className="designer-page-content" data-od-id="pose-page">
          <header className="library-header">
            <h1>Bike and Pose Designer</h1>
            <p data-od-id="clip-name">{editor.scenario.poseClip.name}</p>
            <div
              className="designer-mode segmented"
              data-od-id="designer-mode"
              role="radiogroup"
              aria-label="Designer mode"
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                event.preventDefault();
                const next = mode === "bike" ? "pose" : "bike";
                setMode(next);
                event.currentTarget
                  .querySelector<HTMLButtonElement>(`[data-mode="${next}"]`)
                  ?.focus();
              }}
            >
              {(["bike", "pose"] as const).map((option) => (
                <button
                  key={option}
                  data-mode={option}
                  type="button"
                  role="radio"
                  aria-checked={mode === option}
                  tabIndex={mode === option ? 0 : -1}
                  onClick={() => setMode(option)}
                >
                  {option === "bike" ? "Bike" : "Pose"}
                </button>
              ))}
            </div>
            <span className="status-pill" data-od-id="saturation-pill">
              <i aria-hidden="true" />
              {editor.saturated ? "saturated" : "reachable"}
              <span className="status-source">{editor.saturationReason ?? "finite output"}</span>
            </span>
            {/* The slot is always present so the reason appearing doesn't shift the stage. */}
            <div className="apply-disabled-slot" role="status">
              {visibleApplyDisabledReason ? (
                <p className="apply-disabled-reason" data-od-id="apply-disabled-reason">
                  {visibleApplyDisabledReason}
                </p>
              ) : null}
            </div>
          </header>

          <section
            className={`design-conflict-summary ${allConflicts.length > 0 || bikeDesigner.issues.length > 0 ? "invalid" : "valid"}`}
            data-od-id="design-conflict-summary"
            aria-label="Design conflict summary"
            aria-live="polite"
          >
            <h2>
              {bikeDesigner.issues.length > 0
                ? "Bike geometry issues"
                : allConflicts.length > 0
                  ? "Pose conflicts"
                  : "Ready"}
            </h2>
            <p>
              {bikeDesigner.issues.length > 0
                ? `${bikeDesigner.issues.length} draft geometry issues must be corrected.`
                : affectedKeyCount > 0
                  ? `${affectedKeyCount} poses need attention.`
                  : editor.validationPending && !editor.designValidation
                    ? "Checking poses."
                    : allConflicts.length > 0
                      ? "The pose was adjusted to fit."
                      : "All poses fit the bike."}
            </p>
            {bikeDesigner.issues.length > 0 ? (
              <ul>
                {bikeDesigner.issues.map((issue) => (
                  <li key={`${issue.code}-${issue.fields.join("-")}`}>
                    <button
                      type="button"
                      data-od-id={`design-conflict-geometry-${issue.fields[0] ?? "bike"}`}
                      onClick={() => {
                        const field = issue.fields[0]?.replaceAll(".", "-");
                        if (field) document.getElementById(`bike-dimension-${field}`)?.focus();
                      }}
                    >
                      <strong>{issue.fields[0] ?? "Bike geometry"}</strong>
                      <span>{issue.message}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {allConflicts.length > 0 ? (
              <ul>
                {allConflicts.map((conflict, index) => {
                  const keyIndex = conflict.keyIndex ?? editor.selectedIndex;
                  const parts = [conflict.riderPart, conflict.bikePart].filter(Boolean).join(" / ");
                  return (
                    <li key={`${conflict.code}-${String(keyIndex)}-${String(index)}`}>
                      <button
                        type="button"
                        data-od-id={`design-conflict-${conflict.kind}-${String(keyIndex)}`}
                        onClick={() => editor.selectByIndex(keyIndex)}
                      >
                        <strong>Key {keyIndex + 1}</strong>
                        <span>{conflict.message}</span>
                        {parts ? <small>{parts}</small> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>

          <div className="pose-grid">
            {mode === "bike" && bikeDesigner.draftBike && bikeDesigner.values ? (
              <BikeGeometryRail
                bike={bikeDesigner.draftBike}
                values={bikeDesigner.values}
                issues={bikeDesigner.issues}
                status={bikeDesigner.status}
                onValueChange={bikeDesigner.updateValue}
                onFrameTypeChange={bikeDesigner.updateFrameType}
              />
            ) : (
              <KeyframeRail
                keyframes={editor.keyframes}
                selectedKeyId={editor.selectedKeyId}
                interpolation={editor.interpolation}
                onSelectByIndex={editor.selectByIndex}
                onSelectKey={editor.selectKey}
                onAddKeyframe={editor.addKeyframe}
                onDeleteSelected={editor.deleteSelectedKey}
                onInterpolationChange={editor.setInterpolationMode}
              />
            )}

            <section className="stage-column">
              <DesignerStage
                scenario={editor.scenario}
                selectedS={editor.selectedKey.s}
                selectedLabel={editor.selectedKey.label}
                selectedTargets={editor.selectedKey.targets}
                sample={editor.sample}
                feasibleLimits={editor.feasibleLimits}
                envelopeLimits={editor.envelopeLimits}
                saturated={editor.saturated}
                saturationReason={editor.saturationReason}
                validation={editor.selectedValidation}
                canonicalGeometry={
                  bikeDesigner.inspection ?? editor.designValidation?.geometry ?? null
                }
                mode={mode}
                onResetPose={editor.resetPose}
                onJointDrag={editor.setJointTarget}
              />
              {mode === "pose" ? (
                <DistanceTrack
                  keyframes={editor.keyframes}
                  selectedKeyId={editor.selectedKeyId}
                  interpolation={editor.interpolation}
                  onSelectKey={editor.selectKey}
                  onMoveKey={editor.moveKey}
                />
              ) : null}
            </section>

            {mode === "bike" ? (
              <BikeDerivedRail inspection={bikeDesigner.inspection} />
            ) : (
              <JointRail
                scenario={editor.scenario}
                selectedS={editor.selectedKey.s}
                selectedTargets={editor.selectedKey.targets}
                sample={editor.sample}
                feasibleLimits={editor.feasibleLimits}
                envelopeLimits={editor.envelopeLimits}
                validation={editor.selectedValidation}
                limitingConflicts={editor.limitingConflicts}
                onTargetChange={editor.setJointTarget}
              />
            )}
          </div>

          {editor.surfaceError ? (
            <Callout title="Designer warning" tone="warning">
              {editor.surfaceError}
            </Callout>
          ) : null}
        </div>
      </main>
    </AppShell>
  );
};
