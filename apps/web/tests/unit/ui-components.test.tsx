import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../../src/App";
import { AppProviders } from "../../src/app/AppProviders";
import { renderWithProviders } from "../test-utils";
import {
  AppShell,
  DataTable,
  Field,
  SegmentedControl,
  StaleReference,
  Status
} from "../../src/components/ui";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

describe("shared UI components", () => {
  it("replaces the legacy pose route with the canonical Designer route", async () => {
    window.history.replaceState({}, "", "/pose");

    render(
      <AppProviders>
        <App />
      </AppProviders>
    );

    await waitFor(() => expect(window.location.pathname).toBe("/designer"));
    expect(await screen.findByRole("heading", { name: "Bike and Pose Designer" })).toBeVisible();
  });

  it("renders shell navigation and a single primary action", () => {
    const onPrimary = vi.fn();

    renderWithProviders(
      <AppShell
        scenarioLabel="Scenario A"
        status="ready"
        source="solver"
        primaryLabel="Solve run"
        primaryId="run-solve"
        onPrimary={onPrimary}
      >
        <main data-od-id="workbench-content" />
      </AppShell>
    );

    expect(screen.getByRole("navigation", { name: "Primary" })).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Solve run" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Solve run" }));
    expect(onPrimary).toHaveBeenCalledOnce();
  });

  it("shows source labels and stale-reference recovery actions", () => {
    const onClear = vi.fn();
    const onReplace = vi.fn();

    renderWithProviders(
      <>
        <Status label="ready" source="representative-fixture" />
        <StaleReference
          kind="run"
          label="Run 42"
          reason="Missing from storage"
          onClear={onClear}
          onReplace={onReplace}
        />
      </>
    );

    expect(screen.getByText("recorded fixture")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));

    expect(onClear).toHaveBeenCalledOnce();
    expect(onReplace).toHaveBeenCalledOnce();
  });

  it("keeps field, segmented controls, and table accessible", () => {
    const onValue = vi.fn();
    const onMode = vi.fn();

    renderWithProviders(
      <>
        <Field
          id="entry-speed"
          label="Entry speed"
          value={8}
          minimum={0.5}
          maximum={30}
          step={0.1}
          unit="m/s"
          explanation="Approach speed"
          onChange={onValue}
        />
        <SegmentedControl
          label="Camera"
          value="fit"
          options={[
            { value: "fit", label: "Fit" },
            { value: "follow", label: "Follow" }
          ]}
          onChange={onMode}
        />
        <DataTable caption="Metrics" columns={["Metric", "Value"]} rows={[["Airtime", "1.2"]]} />
      </>
    );

    fireEvent.change(screen.getByLabelText("Entry speed"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Follow" }));

    expect(onValue).toHaveBeenCalledWith(9);
    expect(onMode).toHaveBeenCalledWith("follow");
    expect(screen.getByRole("table")).toBeVisible();
  });
});
