import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type BikeGeometryInspection,
  type DesignValidation,
  hashScenario,
  type Scenario
} from "../../../../packages/schema/src/index";
import { createDemoFixtures } from "../../../../tests/fixtures/ui/demo-fixtures";
import type { SolverGateway } from "../../src/app/services";
import {
  bikeDimensionGroups,
  fromBikeDisplayValue,
  toBikeDisplayValue
} from "../../src/features/designer/bike-dimensions";
import { DesignerPage } from "../../src/features/designer/DesignerPage";
import { useAppStore } from "../../src/state/store";
import { renderWithProviders } from "../test-utils";

const fixtures = createDemoFixtures();

const inspectionFor = (
  scenario: Scenario,
  overrides: Partial<BikeGeometryInspection> = {}
): BikeGeometryInspection => ({
  modelVersion: 1,
  valid: true,
  issues: [],
  closureResidual: 0.004,
  landmarks: {
    rearAxle: { x: -0.625, y: 0.3683 },
    frontAxle: { x: 0.625, y: 0.3683 },
    bottomBracket: { x: -0.19, y: 0.33 },
    headTubeTop: { x: 0.28, y: 0.96 },
    pedalForward: { x: -0.02, y: 0.33 },
    handlebarContact: { x: 0.33, y: 0.99 }
  },
  members: [
    {
      name: "chainstay",
      start: { x: -0.625, y: 0.3683 },
      end: { x: -0.19, y: 0.33 }
    }
  ],
  protectedShapes: [
    {
      part: "chainstay",
      contactSurface: "none",
      shape: "capsule",
      start: { x: -0.625, y: 0.3683 },
      end: { x: -0.19, y: 0.33 },
      radius: 0.025
    }
  ],
  massProperties: {
    totalMass: scenario.bike.mass,
    centerOfGravity: { x: -0.03, y: 0.51 },
    planarInertia: 2.8,
    distributionVersion: 1
  },
  ...overrides
});

const validationFor = (scenario: Scenario, geometry: BikeGeometryInspection): DesignValidation => ({
  geometry,
  poseKeys: [],
  canSolve: geometry.valid,
  conflictCount: geometry.issues.length,
  scenarioHash: "a".repeat(64),
  modelVersion: "geometry-v1",
  solverVersion: scenario.solver.solverVersion
});

const gatewayFor = (overrides: Partial<SolverGateway> = {}): SolverGateway => ({
  initialize: vi.fn().mockResolvedValue({
    protocolVersion: 3,
    solverVersion: "rapier-0.35.2-two-wheel-contact-v4-geometry1-mass1",
    modelVersion: "rigid-two-wheel-contact-v4-geometry1-mass1",
    deterministic: true,
    supportedScenarioPaths: ["scenario.bike.geometry"],
    supportedOutputs: ["bike-geometry"],
    ccd: true,
    contactImpulse: true,
    motorWork: true,
    jointTorque: false
  }),
  solve: vi.fn(),
  cancel: vi.fn().mockResolvedValue(undefined),
  inspectBikeGeometry: vi.fn(async (bike) =>
    inspectionFor({ ...(useAppStore.getState().scenario.scenario as Scenario), bike })
  ),
  resolvePoseEdit: vi.fn(),
  validateDesign: vi.fn(async (scenario) => validationFor(scenario, inspectionFor(scenario))),
  samplePose: vi.fn(async (_scenario, s) => ({
    s,
    targets: { knee: 0.3, hip: -0.5, spine: 0.75 },
    derivedArm: { shoulder: -0.7, elbow: 1.2, constrained: false },
    landmarks: {
      pedalContact: { x: -0.02, y: 0.33 },
      ankle: { x: -0.02, y: 0.33 },
      knee: { x: -0.15, y: 0.58 },
      hip: { x: -0.2, y: 0.91 },
      shoulder: { x: 0.05, y: 1.35 },
      elbow: { x: 0.2, y: 1.18 },
      hand: { x: 0.33, y: 0.99 },
      handlebarContact: { x: 0.33, y: 0.99 },
      head: { x: 0.07, y: 1.55 }
    },
    solverVersion: "rapier-0.35.2-two-wheel-contact-v4-geometry1-mass1"
  })),
  analyzeSpeedWindow: vi.fn(),
  terrain: vi.fn(),
  dispose: vi.fn().mockResolvedValue(undefined),
  ...overrides
});

describe("bike designer", () => {
  beforeEach(async () => {
    useAppStore.getState().actions.clearScenario();
    const scenario = fixtures.createScenario();
    useAppStore.getState().actions.setScenario(scenario, await hashScenario(scenario));
  });

  afterEach(cleanup);

  it("defines grouped display metadata and reversible SI conversions", () => {
    const fields = bikeDimensionGroups.flatMap((group) => group.fields);
    expect(fields.map((field) => field.path)).toEqual(
      expect.arrayContaining([
        "wheelbase",
        "chainstay",
        "bbHeight",
        "geometry.reach",
        "geometry.headTubeAngle",
        "geometry.crankLength",
        "mass"
      ])
    );
    for (const field of fields) {
      expect(field.minimum).toBeLessThan(field.maximum);
      expect(field.step).toBeGreaterThan(0);
      expect(field.description.length).toBeGreaterThan(8);
    }
    expect(toBikeDisplayValue(0.47, "mm")).toBe(470);
    expect(fromBikeDisplayValue(470, "mm")).toBeCloseTo(0.47);
    expect(fromBikeDisplayValue(toBikeDisplayValue(Math.PI / 3, "deg"), "deg")).toBeCloseTo(
      Math.PI / 3
    );
  });

  it("retains invalid drafts, applies only the newest valid inspection, and preserves pose keys", async () => {
    const scenario = useAppStore.getState().scenario.scenario as Scenario;
    const originalKeys = structuredClone(scenario.poseClip.keys);
    let resolveFirst: ((inspection: BikeGeometryInspection) => void) | undefined;
    const inspectBikeGeometry = vi
      .fn()
      .mockResolvedValueOnce(inspectionFor(scenario))
      .mockImplementationOnce(
        () => new Promise<BikeGeometryInspection>((resolve) => (resolveFirst = resolve))
      )
      .mockResolvedValueOnce(inspectionFor(scenario));

    renderWithProviders(<DesignerPage />, {
      route: "/pose",
      services: { solverGateway: gatewayFor({ inspectBikeGeometry }) }
    });
    fireEvent.click(await screen.findByRole("radio", { name: "Bike" }));

    const reach = screen.getByLabelText("Reach");
    fireEvent.change(reach, { target: { value: "480" } });
    await waitFor(() => expect(inspectBikeGeometry).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/checking bike geometry/i)).toBeVisible();

    fireEvent.change(reach, { target: { value: "490" } });
    await waitFor(() => expect(inspectBikeGeometry).toHaveBeenCalledTimes(3));
    resolveFirst?.(
      inspectionFor(scenario, {
        valid: false,
        issues: [
          {
            code: "steering-closure",
            fields: ["geometry.reach"],
            bikeParts: ["fork"],
            message: "Fork does not close to the front axle"
          }
        ]
      })
    );

    await waitFor(() =>
      expect(
        (useAppStore.getState().scenario.scenario as Scenario).bike.geometry.reach
      ).toBeCloseTo(0.49)
    );
    expect((useAppStore.getState().scenario.scenario as Scenario).poseClip.keys).toEqual(
      originalKeys
    );

    fireEvent.change(reach, { target: { value: "700" } });
    expect((await screen.findAllByText(/supported range/i)).length).toBeGreaterThan(0);
    expect(reach).toHaveValue(700);
    expect((useAppStore.getState().scenario.scenario as Scenario).bike.geometry.reach).toBeCloseTo(
      0.49
    );
  });

  it("revalidates every pose key after bicycle or rider dimensions change", async () => {
    const scenario = useAppStore.getState().scenario.scenario as Scenario;
    const validateDesign = vi.fn(async (candidate: Scenario) =>
      validationFor(candidate, inspectionFor(candidate))
    );
    renderWithProviders(<DesignerPage />, {
      route: "/pose",
      services: { solverGateway: gatewayFor({ validateDesign }) }
    });
    fireEvent.click(await screen.findByRole("radio", { name: "Bike" }));
    validateDesign.mockClear();

    fireEvent.change(screen.getByLabelText("Bike mass"), { target: { value: "15" } });
    await waitFor(() => expect(validateDesign).toHaveBeenCalled());
    expect(validateDesign.mock.calls.at(-1)?.[0].poseClip.keys).toHaveLength(
      scenario.poseClip.keys.length
    );

    validateDesign.mockClear();
    useAppStore.getState().actions.updateScenario((current) => ({
      ...current,
      rider: { ...current.rider, height: current.rider.height + 0.01 }
    }));
    await waitFor(() => expect(validateDesign).toHaveBeenCalled());
    expect(validateDesign.mock.calls.at(-1)?.[0].rider.height).toBeCloseTo(
      scenario.rider.height + 0.01
    );
  });

  it("shows rear shock fields like the fork fields only for full-suspension frames", async () => {
    renderWithProviders(<DesignerPage />, {
      route: "/pose",
      services: { solverGateway: gatewayFor() }
    });
    fireEvent.click(await screen.findByRole("radio", { name: "Bike" }));

    expect(screen.getByLabelText("Fork travel")).toBeVisible();
    expect(screen.getByLabelText("Rear shock travel")).toHaveValue(140);
    expect(screen.getByLabelText("Rear shock spring rate")).toHaveValue(22000);
    expect(screen.getByText(/stored with the scenario for reference only/i)).toBeVisible();

    fireEvent.click(screen.getByRole("radio", { name: "Hardtail" }));
    await waitFor(() =>
      expect((useAppStore.getState().scenario.scenario as Scenario).bike.rearShock).toBeNull()
    );
    expect(screen.queryByLabelText("Rear shock travel")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Fork travel")).toBeVisible();
  });

  it("does not commit a cleared bike dimension", async () => {
    renderWithProviders(<DesignerPage />, {
      route: "/pose",
      services: { solverGateway: gatewayFor() }
    });
    fireEvent.click(await screen.findByRole("radio", { name: "Bike" }));
    const before = (useAppStore.getState().scenario.scenario as Scenario).bike.mass;

    fireEvent.change(screen.getByLabelText("Bike mass"), { target: { value: "" } });
    expect(screen.queryAllByText(/supported range/i)).toHaveLength(0);
    expect((useAppStore.getState().scenario.scenario as Scenario).bike.mass).toBe(before);
  });

  it("shows no bike keyframes and restores the pose timeline when modes switch", async () => {
    renderWithProviders(<DesignerPage />, {
      route: "/pose",
      services: { solverGateway: gatewayFor() }
    });
    fireEvent.click(await screen.findByRole("radio", { name: "Bike" }));
    expect(screen.queryByRole("listbox", { name: /keyframe list/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("distance-track")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Bike geometry controls")).toBeVisible();

    fireEvent.click(screen.getByRole("radio", { name: "Pose" }));
    expect(await screen.findByRole("listbox", { name: /keyframe list/i })).toBeVisible();
  });
});
