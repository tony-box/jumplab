import {
  presetSchema,
  scenarioSchema,
  type Preset,
  type Scenario
} from "../../../../../packages/schema/src/index";
import catalogJson from "../../../../../tests/fixtures/presets/catalog-v1.json";
import standardScenarioJson from "../../../../../tests/fixtures/scenarios/standard-v1.json";

export const presetCatalog = Object.freeze(
  presetSchema
    .array()
    .parse(catalogJson)
    .map((preset) => Object.freeze(structuredClone(preset)))
);

export const presetCategories = ["jump", "rider", "bike", "movement"] as const;

export type PresetCategory = (typeof presetCategories)[number];

export const libraryBaseScenario = scenarioSchema.parse(standardScenarioJson);

export const clonePreset = (preset: Preset): Preset => structuredClone(preset);

export const cloneBaseScenario = (): Scenario => structuredClone(libraryBaseScenario);
