import "@testing-library/jest-dom/vitest";

import { cleanup, screen } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RunArtifactRepository } from "../../src/app/services";
import { ReportPage } from "../../src/features/report/ReportPage";
import { useAppStore } from "../../src/state/store";
import { renderWithProviders } from "../test-utils";

const repositoryWith = (overrides: Partial<RunArtifactRepository>): RunArtifactRepository => ({
  save: vi.fn(),
  replaceSolution: vi.fn(),
  get: vi.fn().mockResolvedValue(null),
  getStored: vi.fn().mockResolvedValue(null),
  list: vi.fn().mockResolvedValue([]),
  remove: vi.fn().mockResolvedValue(undefined),
  ...overrides
});

const renderReport = (runId: string, repository: RunArtifactRepository) =>
  renderWithProviders(
    <Routes>
      <Route path="/report/:runId" element={<ReportPage />} />
    </Routes>,
    { route: `/report/${runId}`, services: { runArtifactRepository: repository } }
  );

describe("report page", () => {
  beforeEach(() => useAppStore.getState().actions.clearScenario());
  afterEach(cleanup);

  it("shows an error with a way back when the stored record cannot be parsed", async () => {
    renderReport(
      "run-corrupt",
      repositoryWith({
        get: vi.fn().mockRejectedValue(new Error("Invalid run artifact")),
        list: vi.fn().mockResolvedValue([
          { runId: "run-corrupt", createdAt: "2026-01-01T00:00:00.000Z", source: "solver" },
          { runId: "run-good", createdAt: "2026-01-01T00:00:00.000Z", source: "solver" }
        ])
      })
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not be opened/i);
    expect(alert).toHaveTextContent(/Invalid run artifact/);
    expect(screen.getByRole("link", { name: "Back to workbench" })).toHaveAttribute(
      "href",
      "/workbench"
    );
    expect(screen.getByRole("link", { name: "Open latest run" })).toHaveAttribute(
      "href",
      "/report/run-good"
    );
    expect(screen.queryByText(/loading report/i)).not.toBeInTheDocument();
  });

  it("still reaches the error state when listing runs fails", async () => {
    renderReport(
      "run-x",
      repositoryWith({ list: vi.fn().mockRejectedValue(new Error("Database unreadable")) })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/Database unreadable/);
  });
});
