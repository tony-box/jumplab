import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hashScenario, type Scenario } from "../../../../packages/schema/src/index";
import { createDemoFixtures } from "../../../../tests/fixtures/ui/demo-fixtures";
import { LibraryPage } from "../../src/features/library/LibraryPage";
import { presetCatalog } from "../../src/features/library/presets";
import { createScenarioCatalog } from "../../src/features/library/scenario-catalog";
import { useAppStore } from "../../src/state/store";
import { renderWithProviders } from "../test-utils";

const fixtures = createDemoFixtures();

const presetRider = (presetId: string) => {
  const preset = presetCatalog.find((candidate) => candidate.id === presetId);
  return (preset?.patch as { rider: Scenario["rider"] }).rider;
};

const createCatalog = () =>
  createScenarioCatalog({
    baseScenario: fixtures.createScenario(),
    solverGateway: { analyzeSpeedWindow: vi.fn().mockResolvedValue(null) }
  });

describe("library preset loading", () => {
  beforeEach(async () => {
    const { actions } = useAppStore.getState();
    actions.clearScenario();
    const scenario = fixtures.createScenario();
    actions.setScenario(scenario, await hashScenario(scenario));
    actions.setViewPreference("libraryCategory", "rider");
    actions.setViewPreference("libraryQuery", "");
  });

  afterEach(cleanup);

  it("patches only the rider onto the working scenario", async () => {
    const before = useAppStore.getState().scenario.scenario as Scenario;
    renderWithProviders(<LibraryPage />, {
      route: "/library",
      services: { scenarioCatalog: createCatalog() }
    });

    const [loadCompact] = await screen.findAllByRole("button", { name: "Load" });
    fireEvent.click(loadCompact as HTMLElement);

    await waitFor(() =>
      expect((useAppStore.getState().scenario.scenario as Scenario).rider.mass).toBe(
        presetRider("rider-compact").mass
      )
    );
    const after = useAppStore.getState().scenario.scenario as Scenario;
    expect(after.id).toBe(before.id);
    expect(after.name).toBe(before.name);
    expect(after.jump).toEqual(before.jump);
    expect(after.bike).toEqual(before.bike);
    expect(after.poseClip).toEqual(before.poseClip);
    expect(after.entry).toEqual(before.entry);
  });

  it("ignores a stale preset load that resolves after a newer one", async () => {
    const catalog = createCatalog();
    const realLoad = catalog.load;
    let releaseFirst: (() => void) | undefined;
    let calls = 0;
    catalog.load = async (presetId, base) => {
      calls += 1;
      if (calls === 1) {
        await new Promise<void>((resolve) => (releaseFirst = resolve));
      }
      return realLoad(presetId, base);
    };

    renderWithProviders(<LibraryPage />, {
      route: "/library",
      services: { scenarioCatalog: catalog }
    });

    const [loadCompact, loadPower] = await screen.findAllByRole("button", { name: "Load" });
    fireEvent.click(loadCompact as HTMLElement);
    fireEvent.click(loadPower as HTMLElement);

    await waitFor(() =>
      expect((useAppStore.getState().scenario.scenario as Scenario).rider.mass).toBe(
        presetRider("rider-power").mass
      )
    );

    releaseFirst?.();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((useAppStore.getState().scenario.scenario as Scenario).rider.mass).toBe(
      presetRider("rider-power").mass
    );
  });
});
