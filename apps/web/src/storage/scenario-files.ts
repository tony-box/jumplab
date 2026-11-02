import {
  SCENARIO_FILE_FORMAT,
  canonicalJsonStringify,
  hashScenario,
  parseScenarioFile,
  scenarioFileSchema,
  type Scenario,
  type ScenarioFile,
  type VersionStamp
} from "../../../../packages/schema/src/index";

export const createScenarioFile = async (
  scenario: Scenario,
  version: Omit<VersionStamp, "exportedAt">,
  exportedAt = new Date().toISOString()
): Promise<ScenarioFile> =>
  scenarioFileSchema.parse({
    format: SCENARIO_FILE_FORMAT,
    schemaVersion: 3,
    exportedBy: { ...version, exportedAt },
    scenario,
    contentHash: await hashScenario(scenario)
  });

export const exportScenarioBlob = async (
  scenario: Scenario,
  version: Omit<VersionStamp, "exportedAt">,
  exportedAt?: string
): Promise<Blob> => {
  const file = await createScenarioFile(scenario, version, exportedAt);
  return new Blob([canonicalJsonStringify(file)], { type: "application/json" });
};

export const importScenarioBlob = async (
  blob: Blob,
  commit?: (file: ScenarioFile) => void | Promise<void>
): Promise<ScenarioFile> => {
  const parsedJson: unknown = JSON.parse(await blob.text());
  const file = await parseScenarioFile(parsedJson);
  await commit?.(file);
  return file;
};
