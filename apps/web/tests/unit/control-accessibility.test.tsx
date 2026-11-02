import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NumberInput, SegmentedControl } from "../../src/components/ui";
import { Transport } from "../../src/features/workbench/Transport";
import { usePlayback } from "../../src/features/workbench/usePlayback";
import { ConvergenceChart } from "../../src/rendering/charts/ConvergenceChart";

afterEach(cleanup);

const PlaybackHarness = () => {
  const playback = usePlayback(10, 60, 1, () => undefined);
  return (
    <>
      <Transport
        playback={playback}
        frameCount={10}
        outputHz={60}
        baselinePinned={false}
        onToggleBaseline={() => undefined}
      />
      <span data-testid="frame">{playback.frameIndex}</span>
    </>
  );
};

const SegmentedHarness = ({ onChange }: { onChange: (value: string) => void }) => {
  const [value, setValue] = useState("fit");
  return (
    <SegmentedControl
      label="Camera"
      value={value}
      options={[
        { value: "fit", label: "Fit" },
        { value: "follow", label: "Follow" },
        { value: "manual", label: "Manual" }
      ]}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
};

describe("control accessibility", () => {
  it("leaves arrow keys to the speed slider instead of stepping playback", () => {
    render(<PlaybackHarness />);
    const speed = screen.getByLabelText("Playback speed");

    fireEvent.keyDown(speed, { key: "ArrowRight" });
    expect(screen.getByTestId("frame")).toHaveTextContent("0");

    fireEvent.keyDown(screen.getByRole("button", { name: "Play" }), { key: "ArrowRight" });
    expect(screen.getByTestId("frame")).toHaveTextContent("1");
  });

  it("uses a roving tab stop with arrow-key selection in segmented controls", () => {
    const onChange = vi.fn();
    render(<SegmentedHarness onChange={onChange} />);

    const fit = screen.getByRole("button", { name: "Fit" });
    expect(fit).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("button", { name: "Follow" })).toHaveAttribute("tabindex", "-1");

    fit.focus();
    fireEvent.keyDown(fit, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("follow");
    expect(screen.getByRole("button", { name: "Follow" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Follow" })).toHaveAttribute("tabindex", "0");

    fireEvent.keyDown(screen.getByRole("button", { name: "Follow" }), { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("manual");
  });

  it("never commits NaN from a cleared number input and restores it on blur", () => {
    const onValueChange = vi.fn();
    render(<NumberInput aria-label="Reach" value={470} onValueChange={onValueChange} />);
    const input = screen.getByLabelText("Reach");

    fireEvent.change(input, { target: { value: "" } });
    expect(onValueChange).not.toHaveBeenCalled();
    expect(input).toHaveValue(null);

    fireEvent.blur(input);
    expect(input).toHaveValue(470);

    fireEvent.change(input, { target: { value: "480" } });
    expect(onValueChange).toHaveBeenCalledWith(480);
  });

  it("draws no placeholder convergence points when there is no data", () => {
    const { container } = render(<ConvergenceChart rows={[]} ariaLabel="Convergence" />);
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("circle")).toBeNull();
    expect(screen.getByText(/no convergence data yet/i)).toBeVisible();
  });
});
