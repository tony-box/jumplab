import {
  SCENARIO_FILE_FORMAT,
  SCENARIO_SCHEMA_VERSION,
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
    schemaVersion: SCENARIO_SCHEMA_VERSION,
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

/** Real scenario files are a few kilobytes; anything far larger is not one. */
export const MAX_SCENARIO_FILE_BYTES = 256 * 1024;

export class ScenarioFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScenarioFileError";
  }
}

export const importScenarioBlob = async (
  blob: Blob,
  commit?: (file: ScenarioFile) => void | Promise<void>
): Promise<ScenarioFile> => {
  if (blob.size > MAX_SCENARIO_FILE_BYTES) {
    throw new ScenarioFileError(
      `Scenario files must be under ${MAX_SCENARIO_FILE_BYTES / 1024} KB; this one is ${Math.ceil(blob.size / 1024)} KB`
    );
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(await blob.text());
  } catch {
    throw new ScenarioFileError("This file is not valid JSON");
  }
  if (
    !parsedJson ||
    typeof parsedJson !== "object" ||
    (parsedJson as { format?: unknown }).format !== SCENARIO_FILE_FORMAT
  ) {
    throw new ScenarioFileError("This file is not a Jump Lab scenario export");
  }
  const file = await parseScenarioFile(parsedJson);
  await commit?.(file);
  return file;
};
