import { inputControlContractsSchema } from "../input-contract";

export const spikeControlContracts = inputControlContractsSchema.parse([
  {
    id: "lip-height",
    label: "Lip height",
    unit: "m",
    minimum: 0.2,
    maximum: 4,
    step: 0.05,
    group: "jump",
    physicalQuantity: "length",
    explanation: "Vertical rise from the approach grade to the takeoff lip.",
    scenarioPath: "scenario.jump.lipHeight"
  },
  {
    id: "lip-angle",
    label: "Lip angle",
    unit: "rad",
    minimum: -0.35,
    maximum: 1.5,
    step: 0.01,
    group: "jump",
    physicalQuantity: "plane angle",
    explanation: "Takeoff tangent angle from horizontal; drops allow level or falling edges.",
    scenarioPath: "scenario.jump.lipAngle"
  },
  {
    id: "transition-length",
    label: "Transition length",
    unit: "m",
    minimum: 0.5,
    maximum: 30,
    step: 0.05,
    group: "jump",
    physicalQuantity: "length",
    explanation:
      "Horizontal run from the start of the takeoff to the lip. Kickers are circular arcs, so their length follows from height and lip angle; drops set it directly.",
    scenarioPath: "scenario.jump.transitionLength"
  },
  {
    id: "gap",
    label: "Gap",
    unit: "m",
    minimum: 0,
    maximum: 20,
    step: 0.1,
    group: "jump",
    physicalQuantity: "length",
    explanation: "Horizontal distance from takeoff lip to landing start.",
    scenarioPath: "scenario.jump.gap"
  },
  {
    id: "step-delta",
    label: "Step delta",
    unit: "m",
    minimum: -5,
    maximum: 5,
    step: 0.05,
    group: "landing",
    physicalQuantity: "length",
    explanation: "Landing elevation relative to takeoff elevation.",
    scenarioPath: "scenario.jump.stepDelta"
  },
  {
    id: "landing-angle",
    label: "Landing angle",
    unit: "rad",
    minimum: 0.05,
    maximum: 1.2,
    step: 0.01,
    group: "landing",
    physicalQuantity: "plane angle",
    explanation: "Landing downslope angle measured from horizontal.",
    scenarioPath: "scenario.jump.landingAngle"
  },
  {
    id: "landing-length",
    label: "Landing length",
    unit: "m",
    minimum: 1,
    maximum: 40,
    step: 0.1,
    group: "landing",
    physicalQuantity: "length",
    explanation: "Usable sloped landing distance before rollout.",
    scenarioPath: "scenario.jump.landingLength"
  },
  {
    id: "entry-speed",
    label: "Entry speed",
    unit: "m/s",
    minimum: 0.5,
    maximum: 30,
    step: 0.1,
    group: "entry",
    physicalQuantity: "speed",
    explanation:
      "Speed at the start of the approach. After that only gravity, the terrain, and the rider change it.",
    scenarioPath: "scenario.entry.speed"
  },
  {
    id: "rider-height",
    label: "Rider height",
    unit: "m",
    minimum: 1.2,
    maximum: 2.2,
    step: 0.01,
    group: "rider",
    physicalQuantity: "length",
    explanation: "Standing rider height used for anthropometric segment derivation.",
    scenarioPath: "scenario.rider.height"
  },
  {
    id: "rider-mass",
    label: "Rider mass",
    unit: "kg",
    minimum: 35,
    maximum: 160,
    step: 0.5,
    group: "rider",
    physicalQuantity: "mass",
    explanation: "Rider mass, carried by the rider body that the pose moves relative to the bike.",
    scenarioPath: "scenario.rider.mass"
  },
  {
    id: "rider-strength",
    label: "Rider strength",
    unit: "x",
    minimum: 0.1,
    maximum: 3,
    step: 0.05,
    group: "rider",
    physicalQuantity: "dimensionless",
    explanation:
      "Scales how hard the rider can push and pull on the bike. Weaker riders track the authored pose less closely under load.",
    scenarioPath: "scenario.rider.strengthScale"
  },
  {
    id: "instinct-angle",
    label: "Instinct lean limit",
    unit: "rad",
    minimum: 0,
    maximum: 0.5,
    step: 0.01,
    group: "rider",
    physicalQuantity: "plane angle",
    explanation:
      "Largest in-air lean the rider adds on their own to level the bike for landing. Zero turns the correction off.",
    scenarioPath: "scenario.solver.riderInstinct.maxAngle"
  },
  {
    id: "instinct-offset",
    label: "Instinct shift limit",
    unit: "m",
    minimum: 0,
    maximum: 0.25,
    step: 0.01,
    group: "rider",
    physicalQuantity: "length",
    explanation: "Largest fore-aft body shift the rider adds on their own while airborne.",
    scenarioPath: "scenario.solver.riderInstinct.maxOffset"
  },
  {
    id: "wheelbase",
    label: "Wheelbase",
    unit: "m",
    minimum: 0.8,
    maximum: 1.5,
    step: 0.01,
    group: "bike",
    physicalQuantity: "length",
    explanation: "Distance between front and rear wheel contact centers.",
    scenarioPath: "scenario.bike.wheelbase"
  },
  {
    id: "bike-mass",
    label: "Bike mass",
    unit: "kg",
    minimum: 5,
    maximum: 30,
    step: 0.1,
    group: "bike",
    physicalQuantity: "mass",
    explanation: "Combined bicycle mass excluding the rider.",
    scenarioPath: "scenario.bike.mass"
  },
  {
    id: "fork-travel",
    label: "Fork travel",
    unit: "m",
    minimum: 0,
    maximum: 0.3,
    step: 0.005,
    group: "bike",
    physicalQuantity: "length",
    explanation: "Front suspension travel. Stored for reference; suspension is not simulated yet.",
    scenarioPath: "scenario.bike.fork.travel"
  },
  {
    id: "fork-sag",
    label: "Fork sag",
    unit: "m",
    minimum: 0,
    maximum: 0.12,
    step: 0.002,
    group: "bike",
    physicalQuantity: "length",
    explanation: "Front suspension sag. Stored for reference; suspension is not simulated yet.",
    scenarioPath: "scenario.bike.fork.sag"
  }
]);
