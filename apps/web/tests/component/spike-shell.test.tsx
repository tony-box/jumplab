import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { AppShell, MetricRow, SegmentedControl } from "../../src/components/ui";

describe("spike shell", () => {
  it("keeps stable regions, active navigation, and exactly one primary action", () => {
    const onPrimary = vi.fn();
    const { container } = render(
      <MemoryRouter initialEntries={["/workbench"]}>
        <AppShell
          scenarioLabel="Standard Jump *"
          status="core: fixture"
          primaryId="solve-run"
          primaryLabel="Solve run"
          onPrimary={onPrimary}
        >
          <main data-region="sim-canvas" />
        </AppShell>
      </MemoryRouter>
    );

    expect(container.querySelector('[data-od-id="topbar"]')).toBeInTheDocument();
    expect(container.querySelector('[data-region="sim-canvas"]')).toBeInTheDocument();
    expect(container.querySelectorAll("button.primary")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Workbench" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "Solve run" }));
    expect(onPrimary).toHaveBeenCalledOnce();
  });

  it("exposes option state and metric provenance without relying on color", () => {
    const onChange = vi.fn();
    render(
      <>
        <SegmentedControl
          label="Camera"
          value="fit"
          options={[
            { value: "fit", label: "Fit" },
            { value: "follow", label: "Follow" }
          ]}
          onChange={onChange}
        />
        <MetricRow
          label="Joint torque"
          metric={{ value: null, unit: "N*m", source: "pending-core", reason: "Not attached" }}
        />
      </>
    );

    expect(screen.getByRole("button", { name: "Fit" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Follow" }));
    expect(onChange).toHaveBeenCalledWith("follow");
    expect(screen.getByText("awaiting core")).toBeVisible();
    expect(screen.getByText("Not attached")).toBeInTheDocument();
  });
});
