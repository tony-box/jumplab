import { describe, expect, it } from "vitest";

import type { PoseSample, Scenario } from "../../../../packages/schema/src/index";
import { createDemoFixtures } from "../../../../tests/fixtures/ui/demo-fixtures";
import {
  handleLimitArc,
  handleTargetFromPoint,
  pickPoseHandle,
  poseHandles
} from "../../src/features/designer/pose-handles";
import { poseAuthoringRange } from "../../src/features/designer/pose-sampling";

const scenario: Scenario = createDemoFixtures().createScenario();

const sample: PoseSample = {
  s: 0,
  targets: { knee: 0.3, hip: -0.5, spine: 0.75 },
  derivedArm: { shoulder: -0.2, elbow: 0.9, constrained: false },
  landmarks: {
    pedalContact: { x: -0.18, y: 0.33 },
    ankle: { x: -0.18, y: 0.33 },
    knee: { x: -0.08, y: 0.55 },
    hip: { x: 0.04, y: 0.82 },
    shoulder: { x: 0.08, y: 1.3 },
    elbow: { x: 0.26, y: 1.16 },
    hand: { x: 0.42, y: 1.02 },
    handlebarContact: { x: 0.42, y: 1.02 },
    head: { x: 0.09, y: 1.48 }
  },
  solverVersion: "test"
};

describe("pose grab handles", () => {
  it("anchors one handle per authored joint to its parent joint", () => {
    expect(poseHandles(sample).map((handle) => [handle.joint, handle.point, handle.pivot])).toEqual(
      [
        ["knee", sample.landmarks.knee, sample.landmarks.ankle],
        ["hip", sample.landmarks.hip, sample.landmarks.knee],
        ["spine", sample.landmarks.shoulder, sample.landmarks.hip]
      ]
    );
    expect(poseHandles(null)).toEqual([]);
  });

  it("returns the joint value that puts the grabbed handle under the pointer", () => {
    for (const handle of poseHandles(sample)) {
      const target = 0.42;
      const dragged = {
        x: handle.pivot.x + Math.sin(target) * handle.radius,
        y: handle.pivot.y + Math.cos(target) * handle.radius
      };
      expect(handleTargetFromPoint(handle, dragged)).toBeCloseTo(target, 10);
    }
  });

  it("grabs only the nearest handle inside the grab radius", () => {
    const handles = poseHandles(sample);

    expect(pickPoseHandle(handles, sample.landmarks.hip)?.joint).toBe("hip");
    expect(pickPoseHandle(handles, { x: -0.09, y: 0.56 })?.joint).toBe("knee");
    expect(pickPoseHandle(handles, { x: 1.4, y: 2.1 })).toBeNull();
  });

  it("draws each limit arc across exactly the range it is given", () => {
    for (const handle of poseHandles(sample)) {
      const declared = poseAuthoringRange(scenario, handle.joint);
      const reachable = { min: declared.min / 2, max: declared.max / 2 };

      for (const range of [declared, reachable]) {
        const arc = handleLimitArc(handle, range);
        const angleAt = (index: number) =>
          Math.atan2(arc[index]!.x - handle.pivot.x, arc[index]!.y - handle.pivot.y);

        expect(angleAt(0)).toBeCloseTo(range.min, 10);
        expect(angleAt(arc.length - 1)).toBeCloseTo(range.max, 10);
        for (const point of arc) {
          expect(Math.hypot(point.x - handle.pivot.x, point.y - handle.pivot.y)).toBeCloseTo(
            handle.radius,
            10
          );
        }
      }
    }
  });
});
