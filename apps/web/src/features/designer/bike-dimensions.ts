import type { BikeSpec } from "../../../../../packages/schema/src/index";

export type BikeDisplayUnit = "mm" | "deg" | "kg" | "in" | "N/m" | "N s/m";

export type BikeDimensionPath =
  | "wheelSize"
  | "wheelbase"
  | "chainstay"
  | "bbHeight"
  | "mass"
  | `geometry.${keyof BikeSpec["geometry"]}`
  | `fork.${keyof BikeSpec["fork"]}`
  | `rearShock.${keyof BikeSpec["fork"]}`;

export type BikeDimensionField = {
  path: BikeDimensionPath;
  label: string;
  unit: BikeDisplayUnit;
  minimum: number;
  maximum: number;
  step: number;
  description: string;
};

export type BikeDimensionGroup = {
  id: string;
  label: string;
  fields: BikeDimensionField[];
};

const mm = (
  path: BikeDimensionPath,
  label: string,
  minimum: number,
  maximum: number,
  description: string,
  step = 1
): BikeDimensionField => ({ path, label, unit: "mm", minimum, maximum, step, description });

const deg = (
  path: BikeDimensionPath,
  label: string,
  minimum: number,
  maximum: number,
  description: string
): BikeDimensionField => ({ path, label, unit: "deg", minimum, maximum, step: 0.1, description });

export const bikeDimensionGroups: BikeDimensionGroup[] = [
  {
    id: "wheels-frame",
    label: "Wheels and frame",
    fields: [
      {
        path: "wheelSize",
        label: "Wheel size",
        unit: "in",
        minimum: 26,
        maximum: 29,
        step: 1.5,
        description: "Nominal wheel diameter used to derive tire radius."
      },
      mm("wheelbase", "Wheelbase", 800, 1500, "Distance between the rear and front wheel axles."),
      mm("chainstay", "Chainstay", 300, 650, "Distance from the rear axle to the bottom bracket."),
      mm(
        "bbHeight",
        "Bottom bracket height",
        200,
        500,
        "Bottom bracket height above the local ground line."
      )
    ]
  },
  {
    id: "fit",
    label: "Fit",
    fields: [
      mm(
        "geometry.reach",
        "Reach",
        300,
        600,
        "Horizontal distance from bottom bracket to head-tube top."
      ),
      mm(
        "geometry.stack",
        "Stack",
        450,
        800,
        "Vertical distance from bottom bracket to head-tube top."
      ),
      mm(
        "geometry.seatTubeLength",
        "Seat tube length",
        250,
        650,
        "Distance from bottom bracket to the seat-tube top."
      ),
      deg(
        "geometry.seatTubeAngle",
        "Seat tube angle",
        60.16,
        83.08,
        "Seat axis angle measured from forward horizontal."
      )
    ]
  },
  {
    id: "steering-fork",
    label: "Steering and fork",
    fields: [
      mm(
        "geometry.headTubeLength",
        "Head tube length",
        60,
        250,
        "Length of the steering head tube along its axis."
      ),
      deg(
        "geometry.headTubeAngle",
        "Head tube angle",
        49.85,
        80.21,
        "Steering axis angle measured from forward horizontal."
      ),
      mm(
        "geometry.forkLength",
        "Fork length",
        300,
        650,
        "Crown-to-axle length along the steering assembly."
      ),
      mm(
        "geometry.forkOffset",
        "Fork offset",
        0,
        100,
        "Front axle offset perpendicular to the steering axis."
      )
    ]
  },
  {
    id: "saddle-crank",
    label: "Saddle and crank",
    fields: [
      mm(
        "geometry.saddleHeight",
        "Saddle height",
        300,
        900,
        "Bottom-bracket to saddle-center distance along the seat axis."
      ),
      mm(
        "geometry.saddleSetback",
        "Saddle setback",
        -150,
        250,
        "Rearward saddle offset from the seat axis; negative is forward."
      ),
      mm(
        "geometry.crankLength",
        "Crank length",
        145,
        190,
        "Bottom-bracket to pedal-contact distance."
      )
    ]
  },
  {
    id: "cockpit",
    label: "Cockpit",
    fields: [
      mm(
        "geometry.handlebarOffsetX",
        "Handlebar offset X",
        -100,
        300,
        "Horizontal grip offset from the head-tube top."
      ),
      mm(
        "geometry.handlebarOffsetY",
        "Handlebar offset Y",
        -150,
        250,
        "Vertical grip offset from the head-tube top."
      )
    ]
  },
  {
    id: "mass",
    label: "Mass",
    fields: [
      {
        path: "mass",
        label: "Bike mass",
        unit: "kg",
        minimum: 5,
        maximum: 30,
        step: 0.1,
        description: "Total bicycle mass."
      }
    ]
  },
  {
    id: "suspension",
    label: "Suspension",
    fields: [
      mm("fork.travel", "Fork travel", 0, 300, "Available front suspension travel."),
      mm("fork.sag", "Fork sag", 0, 150, "Static front suspension compression."),
      {
        path: "fork.springRate",
        label: "Fork spring rate",
        unit: "N/m",
        minimum: 1000,
        maximum: 100000,
        step: 100,
        description: "Linear front suspension spring rate."
      },
      {
        path: "fork.damping",
        label: "Fork damping",
        unit: "N s/m",
        minimum: 0,
        maximum: 10000,
        step: 10,
        description: "Linear front suspension damping coefficient."
      }
    ]
  }
];

export const toBikeDisplayValue = (value: number, unit: BikeDisplayUnit): number => {
  if (unit === "mm") return value * 1000;
  if (unit === "deg") return (value * 180) / Math.PI;
  return value;
};

export const fromBikeDisplayValue = (value: number, unit: BikeDisplayUnit): number => {
  if (unit === "mm") return value / 1000;
  if (unit === "deg") return (value * Math.PI) / 180;
  return value;
};
