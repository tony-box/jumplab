import { useRef, useState } from "react";
import { hashScenario } from "../../../../../packages/schema/src/index";

import { versionManifest } from "../../app/version-manifest";
import { Button } from "../../components/ui";
import { useAppStore } from "../../state/store";
import { exportScenarioBlob, importScenarioBlob } from "../../storage/scenario-files";

const fileNameFor = (name: string) =>
  `${
    name
      .trim()
      .replace(/[^A-Za-z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "") || "scenario"
  }.jumplab.json`;

/** Saves the working scenario to a file and loads one back, migrating older exports. */
export const ScenarioFileActions = () => {
  const scenario = useAppStore((state) => state.scenario.scenario);
  const actions = useAppStore((state) => state.actions);
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const exportScenario = async () => {
    if (!scenario) return;
    try {
      const blob = await exportScenarioBlob(scenario, {
        appVersion: versionManifest.app,
        solverVersion: versionManifest.solver
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileNameFor(scenario.name);
      link.click();
      // Revoke after the click has been dispatched, or some browsers cancel the download.
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setMessage({ tone: "ok", text: `Exported ${link.download}` });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Export failed"
      });
    }
  };

  const importScenario = async (file: File) => {
    try {
      const imported = await importScenarioBlob(file);
      actions.setScenario(imported.scenario, await hashScenario(imported.scenario));
      setMessage({ tone: "ok", text: `Loaded “${imported.scenario.name}”` });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Import failed"
      });
    }
  };

  return (
    <div className="scenario-file-actions">
      <div className="scenario-file-buttons">
        <Button onClick={() => void exportScenario()} disabled={!scenario}>
          Export
        </Button>
        <Button onClick={() => inputRef.current?.click()}>Import</Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          hidden
          aria-label="Import scenario file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void importScenario(file);
          }}
        />
      </div>
      {message ? (
        <p
          className={`scenario-file-message${message.tone === "error" ? " is-error" : ""}`}
          role={message.tone === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
};
