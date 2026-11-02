import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";

import {
  hashScenario,
  normalizeJump,
  type Preset,
  type Scenario
} from "../../../../../packages/schema/src/index";
import { useAppServices } from "../../app/AppProviders";
import {
  selectSessionState,
  selectStoreActions,
  useAppStore,
  type SessionReferenceState
} from "../../state/store";
import { presetCategories, type PresetCategory } from "./presets";
import { scenarioKeysForCategory, type ScenarioCatalogWithCounts } from "./scenario-catalog";

type LibraryCounts = Record<PresetCategory, number>;

const defaultCounts: LibraryCounts = {
  jump: 0,
  rider: 0,
  bike: 0,
  movement: 0
};

const isEditableElement = (value: EventTarget | null): boolean => {
  if (!(value instanceof HTMLElement)) {
    return false;
  }

  if (value.isContentEditable) {
    return true;
  }

  const tag = value.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
};

const ensureCategory = (value: string): PresetCategory => {
  if (presetCategories.includes(value as PresetCategory)) {
    return value as PresetCategory;
  }
  return "jump";
};

const stalePreset = (
  sessionStale: Record<string, SessionReferenceState>
): SessionReferenceState | null => {
  return Object.values(sessionStale).find((reference) => reference.kind === "preset") ?? null;
};

export const useLibrary = () => {
  const navigate = useNavigate();
  const services = useAppServices();
  const actions = useAppStore(selectStoreActions);
  const session = useAppStore(selectSessionState);

  const catalog = services.scenarioCatalog as ScenarioCatalogWithCounts;
  const searchRef = useRef<HTMLInputElement | null>(null);

  const [category, setCategoryState] = useState<PresetCategory>(
    ensureCategory(session.view.libraryCategory)
  );
  const [query, setQueryState] = useState<string>(session.view.libraryQuery);
  const [counts, setCounts] = useState<LibraryCounts>(defaultCounts);
  const [results, setResults] = useState<Preset[]>([]);
  const [previews, setPreviews] = useState<Map<string, Scenario>>(new Map());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const stale = useMemo(() => stalePreset(session.staleReferences), [session.staleReferences]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [nextResults, nextCounts] = await Promise.all([
        catalog.search(category, query),
        catalog.count(query)
      ]);
      const previewEntries = await Promise.all(
        nextResults.map(async (preset) => [preset.id, await catalog.preview(preset.id)] as const)
      );
      setResults(nextResults);
      setCounts(nextCounts);
      setPreviews(new Map(previewEntries));
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Failed to load presets");
      setResults([]);
      setCounts(defaultCounts);
      setPreviews(new Map());
    } finally {
      setLoading(false);
    }
  }, [catalog, category, query]);

  useEffect(() => {
    actions.setRoute("/library");
  }, [actions]);

  useEffect(() => {
    actions.setViewPreference("libraryCategory", category);
  }, [actions, category]);

  useEffect(() => {
    actions.setViewPreference("libraryQuery", query);
  }, [actions, query]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && !isEditableElement(document.activeElement)) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }

      if (event.key === "Escape" && query && !isEditableElement(document.activeElement)) {
        event.preventDefault();
        setQueryState("");
        searchRef.current?.focus();
      }

      if (event.key === "Escape" && query && document.activeElement === searchRef.current) {
        event.preventDefault();
        setQueryState("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [query]);

  const requestRef = useRef(0);

  const reportFailure = useCallback(
    (unknownError: unknown) => {
      const message = unknownError instanceof Error ? unknownError.message : "Preset unavailable";
      setError(message);
      actions.markStaleReference({
        kind: "preset",
        id: `${category}:${query}`,
        label: "Preset selection",
        reason: message,
        stale: true
      });
    },
    [actions, category, query]
  );

  const openWorkbench = useCallback(() => {
    actions.setRoute("/workbench");
    navigate("/workbench");
  }, [actions, navigate]);

  const handoff = useCallback(
    async (loader: () => Promise<Scenario>) => {
      const requestId = ++requestRef.current;
      try {
        const scenario = await loader();
        const hash = await hashScenario(scenario);
        if (requestId !== requestRef.current) {
          return;
        }
        actions.setScenario(scenario, hash);
        openWorkbench();
      } catch (unknownError) {
        if (requestId === requestRef.current) {
          reportFailure(unknownError);
        }
      }
    },
    [actions, openWorkbench, reportFailure]
  );

  const createScenario = useCallback(
    () => handoff(() => catalog.create(category)),
    [catalog, category, handoff]
  );

  const loadPreset = useCallback(
    async (presetId: string) => {
      const working = useAppStore.getState().scenario;
      if (!working.scenario) {
        return handoff(() => catalog.load(presetId));
      }

      const requestId = ++requestRef.current;
      const workingId = working.workingId;
      try {
        const preset = results.find((candidate) => candidate.id === presetId) ?? null;
        const presetCategory = preset?.category ?? category;
        const patched = await catalog.load(presetId, working.scenario);
        const latest = useAppStore.getState().scenario;
        if (requestId !== requestRef.current || latest.workingId !== workingId) {
          return;
        }
        const keys = scenarioKeysForCategory(presetCategory);
        actions.updateScenario((current) => {
          const next: Scenario = { ...current };
          for (const key of keys) {
            Object.assign(next, { [key]: structuredClone(patched[key]) });
          }
          return keys.includes("jump") ? { ...next, jump: normalizeJump(next.jump) } : next;
        });
        openWorkbench();
      } catch (unknownError) {
        if (requestId === requestRef.current) {
          reportFailure(unknownError);
        }
      }
    },
    [actions, catalog, category, handoff, openWorkbench, reportFailure, results]
  );

  const duplicatePreset = useCallback(
    (presetId: string) => handoff(() => catalog.duplicate(presetId)),
    [catalog, handoff]
  );

  const clearStale = useCallback(() => {
    if (!stale) {
      return;
    }
    actions.clearStaleReference(stale.kind, stale.id);
    setError(null);
  }, [actions, stale]);

  const setCategory = useCallback((nextCategory: string) => {
    setCategoryState(ensureCategory(nextCategory));
  }, []);

  return {
    category,
    counts,
    query,
    results,
    loading,
    error,
    stale,
    previews,
    searchRef,
    setCategory,
    setQuery: setQueryState,
    clearQuery: () => setQueryState(""),
    createScenario,
    loadPreset,
    duplicatePreset,
    clearStale
  };
};
