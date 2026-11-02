import { useEffect } from "react";

import { useAppStore } from "../state/store";
import { useAppServices } from "./AppProviders";

const AUTOSAVE_DELAY_MS = 600;

/** Saves the working scenario shortly after each change so a reload picks up where it left off. */
export const useScenarioAutosave = () => {
  const { scenarioStore } = useAppServices();
  const scenario = useAppStore((state) => state.scenario.scenario);

  useEffect(() => {
    if (!scenario) return;
    const timer = setTimeout(() => {
      void scenarioStore.saveWorking(scenario).catch((error: unknown) => {
        // Losing an autosave is not worth interrupting the user; the next edit retries.
        console.warn("Working scenario was not saved", error);
      });
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [scenario, scenarioStore]);
};
