import { describe, expect, it } from "vitest";

import {
  inputControlContractsSchema,
  spikeControlContracts
} from "../../../../packages/schema/src/index";

describe("spike input contracts", () => {
  it("provides unique canonical controls with SI units, ranges, quantities, and explanations", () => {
    const controls = inputControlContractsSchema.parse(spikeControlContracts);

    expect(controls.length).toBeGreaterThanOrEqual(14);
    expect(new Set(controls.map((control) => control.id)).size).toBe(controls.length);
    expect(new Set(controls.map((control) => control.scenarioPath)).size).toBe(controls.length);

    for (const control of controls) {
      expect(control.unit).toMatch(/^(m|rad|m\/s|kg|x)$/);
      expect(control.minimum).toBeLessThan(control.maximum);
      expect(control.physicalQuantity.length).toBeGreaterThan(2);
      expect(control.explanation.length).toBeGreaterThan(20);
      expect(control.scenarioPath).toMatch(/^scenario\.(jump|entry|rider|bike|solver\.riderInstinct)\./);
    }
  });

  it("covers every representative rendered-workbench section", () => {
    const paths = spikeControlContracts.map((control) => control.scenarioPath);

    expect(paths.some((path) => path.startsWith("scenario.jump."))).toBe(true);
    expect(paths.some((path) => path.startsWith("scenario.entry."))).toBe(true);
    expect(paths.some((path) => path.startsWith("scenario.rider."))).toBe(true);
    expect(paths.some((path) => path.startsWith("scenario.bike."))).toBe(true);
  });
});
