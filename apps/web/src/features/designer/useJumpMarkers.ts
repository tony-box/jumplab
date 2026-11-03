import { useEffect, useState } from "react";

import type { Scenario } from "../../../../../packages/schema/src/index";

import { useAppServices } from "../../app/AppProviders";

export type JumpMarker = {
  id: "transition" | "lip" | "landing";
  label: string;
  /** Distance along the run, in the same units as pose keys (bike x). */
  s: number;
};

/**
 * Where the jump's features sit along the run, from the core's terrain profile. Pose keys are
 * placed by the bike's x (ground level, midway between the axles), so these line up directly.
 */
export const useJumpMarkers = (scenario: Scenario | null): JumpMarker[] => {
  const { solverGateway } = useAppServices();
  const [markers, setMarkers] = useState<JumpMarker[]>([]);
  const jumpKey = scenario ? JSON.stringify(scenario.jump) : null;

  useEffect(() => {
    if (!scenario) return;
    let active = true;
    Promise.resolve()
      .then(() => solverGateway.terrain(scenario, 0.1))
      .then((profile) => {
        if (!active) return;
        setMarkers([
          // The terrain is built with the takeoff transition starting at x = 0.
          { id: "transition", label: "Transition", s: 0 },
          { id: "lip", label: "Lip", s: profile.lipX },
          { id: "landing", label: "Landing", s: profile.landingStartX }
        ]);
      })
      .catch(() => {
        // Without a profile the strip just shows the keys.
        if (active) setMarkers([]);
      });
    return () => {
      active = false;
    };
    // Markers depend only on the jump shape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpKey, solverGateway]);

  return markers;
};
