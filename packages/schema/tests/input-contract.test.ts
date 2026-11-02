import { describe, expect, it } from "vitest";

import {
  inputControlContractSchema,
  inputControlContractsSchema,
  type InputControlContract
} from "../src/index";

const controls: InputControlContract[] = [
  {
    id: "entry.speed",
    label: "Entry speed",
    unit: "m/s",
    minimum: 0.5,
    maximum: 30,
    step: 0.1,
    group: "entry",
    physicalQuantity: "Approach speed at simulation start",
    explanation: "Higher speed increases launch energy and airtime.",
    scenarioPath: "scenario.entry.speed"
  },
  {
    id: "jump.gap",
    label: "Gap",
    unit: "m",
    minimum: 0,
    maximum: 20,
    step: 0.1,
    group: "jump",
    physicalQuantity: "Horizontal distance from lip to landing",
    explanation: "Wider gaps require higher speed and suitable trajectory.",
    scenarioPath: "scenario.jump.gap"
  }
];

describe("input control contract", () => {
  it("accepts complete entries", () => {
    expect(() => inputControlContractSchema.parse(controls[0])).not.toThrow();
    expect(() => inputControlContractsSchema.parse(controls)).not.toThrow();
  });

  it("rejects missing metadata", () => {
    expect(() =>
      inputControlContractSchema.parse({
        ...controls[0],
        unit: ""
      })
    ).toThrow();

    expect(() =>
      inputControlContractSchema.parse({
        ...controls[0],
        explanation: ""
      })
    ).toThrow();
  });

  it("rejects invalid ranges and duplicate identity", () => {
    expect(() =>
      inputControlContractSchema.parse({
        ...controls[0],
        minimum: 10,
        maximum: 2
      })
    ).toThrow();

    expect(() =>
      inputControlContractsSchema.parse([
        controls[0],
        {
          ...controls[1],
          id: controls[0].id
        }
      ])
    ).toThrow();

    expect(() =>
      inputControlContractsSchema.parse([
        controls[0],
        {
          ...controls[1],
          scenarioPath: controls[0].scenarioPath
        }
      ])
    ).toThrow();
  });
});
