import {
  entrySpeedWindowInfoSchema,
  hashScenario,
  normalizeJump,
  presetSchema,
  scenarioSchema,
  type EntrySpeedWindowInfo,
  type Preset,
  type Scenario
} from "../../../../../packages/schema/src/index";

import type { ScenarioCatalog, SolverGateway } from "../../app/services";
import {
  cloneBaseScenario,
  clonePreset,
  presetCatalog,
  presetCategories,
  type PresetCategory
} from "./presets";

type ScenarioCatalogOptions = {
  presets?: Preset[];
  baseScenario?: Scenario;
  solverGateway: Pick<SolverGateway, "analyzeSpeedWindow">;
  idFactory?: () => string;
};

export type ScenarioCatalogWithCounts = ScenarioCatalog & {
  count: (query: string) => Promise<Record<PresetCategory, number>>;
  getById: (presetId: string) => Promise<Preset | null>;
  preview: (presetId: string) => Promise<Scenario>;
};

const categorySet = new Set<PresetCategory>(presetCategories);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const mergeDeep = (base: unknown, patch: unknown): unknown => {
  if (Array.isArray(patch)) {
    return patch.map((item) => mergeDeep(undefined, item));
  }

  if (!isRecord(patch)) {
    return patch;
  }

  const source = isRecord(base) ? base : {};
  const result: Record<string, unknown> = { ...source };
  for (const [key, value] of Object.entries(patch)) {
    result[key] = mergeDeep(source[key], value);
  }
  return result;
};

const normalizeQuery = (query: string): string => query.trim().toLowerCase();

const matchesQuery = (preset: Preset, query: string): boolean => {
  const normalized = normalizeQuery(query);
  if (!normalized) {
    return true;
  }

  const haystack = [preset.name, preset.note, ...preset.tags].join(" ").toLowerCase();
  return haystack.includes(normalized);
};

const hashCalculationInputs = (scenario: Scenario): Promise<string> =>
  hashScenario({
    schemaVersion: scenario.schemaVersion,
    jump: scenario.jump,
    rider: scenario.rider,
    bike: scenario.bike,
    entry: scenario.entry,
    poseClip: scenario.poseClip,
    solver: scenario.solver
  });

const toUnavailableWindow = (reason: string): EntrySpeedWindowInfo =>
  entrySpeedWindowInfoSchema.parse({
    minimum: 0,
    maximum: 0,
    status: "unavailable",
    reason
  });

const applyPresetPatch = (base: Scenario, preset: Preset, nextName: string): Scenario => {
  const merged = mergeDeep(base, preset.patch) as Record<string, unknown>;
  merged.id = crypto.randomUUID();
  merged.name = nextName;
  merged.jump = normalizeJump(merged.jump as Scenario["jump"]);
  return scenarioSchema.parse(merged);
};

const presetScenarioKeys: Record<PresetCategory, readonly (keyof Scenario)[]> = {
  jump: ["jump", "entry"],
  rider: ["rider"],
  bike: ["bike"],
  movement: ["poseClip"]
};

/** Scenario sections a preset of this category is allowed to change. */
export const scenarioKeysForCategory = (category: PresetCategory): readonly (keyof Scenario)[] =>
  presetScenarioKeys[category];

/**
 * Applies only the category-owned sections of a preset patch to an existing scenario,
 * keeping its identity, name and every other section untouched.
 */
export const applyPresetToScenario = (base: Scenario, preset: Preset): Scenario => {
  const patch = isRecord(preset.patch) ? preset.patch : {};
  const next = structuredClone(scenarioSchema.parse(base)) as Record<string, unknown>;
  for (const key of presetScenarioKeys[preset.category]) {
    if (key in patch) {
      next[key] = mergeDeep(next[key], patch[key]);
    }
  }
  if (preset.category === "jump") {
    next.jump = normalizeJump(next.jump as Scenario["jump"]);
  }
  return scenarioSchema.parse(next);
};

const ensureCategory = (value: string): PresetCategory => {
  if (!categorySet.has(value as PresetCategory)) {
    return "jump";
  }
  return value as PresetCategory;
};

export const createScenarioCatalog = (
  options: ScenarioCatalogOptions
): ScenarioCatalogWithCounts => {
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const baseScenario = scenarioSchema.parse(options.baseScenario ?? cloneBaseScenario());
  const presets = presetSchema
    .array()
    .parse(options.presets ?? presetCatalog)
    .map(clonePreset);
  const speedWindowMemo = new Map<string, Promise<EntrySpeedWindowInfo>>();

  const resolvePreset = (presetId: string): Preset => {
    const preset = presets.find((candidate) => candidate.id === presetId);
    if (!preset) {
      throw new Error(`Preset ${presetId} is unavailable`);
    }
    return clonePreset(preset);
  };

  const resolveScenario = (preset: Preset, base?: Scenario): Scenario => {
    const source = scenarioSchema.parse(base ?? baseScenario);
    return applyPresetPatch(source, preset, preset.name);
  };

  const resolveSpeedWindow = async (
    preset: Preset,
    scenario: Scenario
  ): Promise<EntrySpeedWindowInfo | null> => {
    if (preset.category !== "jump") {
      return null;
    }

    if (preset.speedWindow) {
      return entrySpeedWindowInfoSchema.parse(preset.speedWindow);
    }

    const geometryHash = await hashCalculationInputs(scenario);
    let pending = speedWindowMemo.get(geometryHash);
    if (!pending) {
      pending = options.solverGateway
        .analyzeSpeedWindow(scenario)
        .then((result) => {
          if (result.status === "unavailable" && !result.reason) {
            return toUnavailableWindow("Awaiting validated speed-window guidance");
          }
          return entrySpeedWindowInfoSchema.parse(result);
        })
        .catch((error: unknown) =>
          toUnavailableWindow(
            error instanceof Error ? error.message : "Awaiting validated speed-window guidance"
          )
        );
      speedWindowMemo.set(geometryHash, pending);
    }

    return pending;
  };

  const hydratePreset = async (preset: Preset): Promise<Preset> => {
    const scenario = resolveScenario(preset);
    const speedWindow = await resolveSpeedWindow(preset, scenario);
    return presetSchema.parse({
      ...clonePreset(preset),
      speedWindow
    });
  };

  const list: ScenarioCatalog["list"] = async (category) => {
    const safeCategory = ensureCategory(category);
    const matches = presets.filter((preset) => preset.category === safeCategory);
    return Promise.all(matches.map((preset) => hydratePreset(preset)));
  };

  const search: ScenarioCatalog["search"] = async (category, query) => {
    const safeCategory = ensureCategory(category);
    const all = await list(safeCategory);
    return all.filter((preset) => matchesQuery(preset, query));
  };

  const count = async (query: string): Promise<Record<PresetCategory, number>> => {
    const normalized = normalizeQuery(query);
    return {
      jump: presets.filter(
        (preset) => preset.category === "jump" && matchesQuery(preset, normalized)
      ).length,
      rider: presets.filter(
        (preset) => preset.category === "rider" && matchesQuery(preset, normalized)
      ).length,
      bike: presets.filter(
        (preset) => preset.category === "bike" && matchesQuery(preset, normalized)
      ).length,
      movement: presets.filter(
        (preset) => preset.category === "movement" && matchesQuery(preset, normalized)
      ).length
    };
  };

  const create: ScenarioCatalog["create"] = async (category) => {
    const safeCategory = ensureCategory(category);
    const fallback = presets.find((preset) => preset.category === safeCategory);
    if (!fallback) {
      throw new Error(`No default preset exists for ${safeCategory}`);
    }

    const scenario = resolveScenario(fallback);
    scenario.id = idFactory();
    scenario.name = `New ${fallback.name}`;
    return scenarioSchema.parse(scenario);
  };

  const load: ScenarioCatalog["load"] = async (presetId, base) => {
    const preset = resolvePreset(presetId);
    if (base) {
      return applyPresetToScenario(base, preset);
    }
    const scenario = resolveScenario(preset);
    scenario.id = idFactory();
    scenario.name = preset.name;
    return scenarioSchema.parse(scenario);
  };

  const duplicate: ScenarioCatalog["duplicate"] = async (sourceId) => {
    const preset = resolvePreset(sourceId);
    const scenario = resolveScenario(preset);
    scenario.id = idFactory();
    scenario.name = `${preset.name} Copy`;
    return scenarioSchema.parse(scenario);
  };

  const getById = async (presetId: string): Promise<Preset | null> => {
    const preset = presets.find((candidate) => candidate.id === presetId);
    return preset ? hydratePreset(preset) : null;
  };

  const preview = async (presetId: string): Promise<Scenario> => {
    const preset = resolvePreset(presetId);
    const scenario = resolveScenario(preset, baseScenario);
    scenario.id = baseScenario.id;
    return scenarioSchema.parse(scenario);
  };

  return {
    list,
    search,
    count,
    create,
    load,
    duplicate,
    getById,
    preview
  };
};
