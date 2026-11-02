# Contract: Terrain Profile Export

**Feature**: [../spec.md](../spec.md) | **Status**: Design | **Protocol version**: 2

Establishes one authoritative segmented ground profile shared by the solver and the renderer,
satisfying FR-006 and FR-008.

## 1. Principle

There is exactly one terrain generator: `generate_terrain_profile` in
`crates/physics-core/src/geometry.rs`. The renderer MUST NOT compute, approximate, simplify, or
smooth the ground profile. The existing six-point schematic in
`apps/web/src/rendering/canvas/terrain-profile.ts` is deleted.

The generator emits separate segments. No collision edge, rendered line, or height interpolation
exists between segments. Table jumps include a deck segment; gap, step-up, and step-down jumps leave
the lip-to-landing interval empty. This prevents a phantom surface across a real gap.

## 2. WebAssembly Export

```text
terrainProfileJson(scenarioJson: string, step: number) -> string (JSON)
```

Exposed via `#[wasm_bindgen(js_name = terrainProfileJson)]` alongside the existing
`solveScenarioJson` and `capabilitiesJson` exports in `crates/physics-core/src/lib.rs`.

### Response shape

```json
{
  "segments": [
    {
      "id": "approach-takeoff",
      "kind": "approach-takeoff",
      "points": [[-14.8, 0.0], [0.0, 0.0], [0.1, 0.0042], [1.05, 1.2]]
    },
    {
      "id": "landing-face",
      "kind": "landing-face",
      "points": [[4.05, -0.8], [4.05, 1.2]]
    },
    {
      "id": "landing-rollout",
      "kind": "landing-rollout",
      "points": [[4.05, 1.2], [10.05, -0.8], [18.05, -0.8]]
    }
  ],
  "approachStartX": -14.8,
  "lipX": 1.05,
  "landingStartX": 4.05,
  "sampleStep": 0.1
}
```

### Guarantees

- Pure function of the complete scenario and `step`; no global or run state is read.
- Deterministic and byte-identical across repeated calls and between native and WebAssembly builds.
- Each segment contains at least two finite points ordered along that segment.
- `approachStartX <= entry.startX - wheelbase / 2 - wheelRadius`, so both wheels begin over a real
  approach surface.
- No segment spans an intentional void. Queries inside a void return no surface rather than
  interpolating between unrelated segment endpoints.
- A non-positive `step` falls back to `0.25`, matching existing generator behaviour.
- Errors are returned as a rejected result with a message identifying the invalid field, never as a
  silently empty profile.

## 3. Worker Command

Added to `packages/schema/src/worker-protocol.ts`.

### Request

```json
{ "kind": "terrain", "requestId": "...", "scenario": {}, "step": 0.1 }
```

### Response

```json
{
  "kind": "terrain",
  "requestId": "...",
  "profile": {
    "segments": [],
    "approachStartX": 0,
    "lipX": 0,
    "landingStartX": 0,
    "sampleStep": 0.1
  }
}
```

The gateway (`apps/web/src/solver/gateway.ts`) exposes this as `terrain(scenario, step)`. Because the
profile depends on the complete scenario and `step`, the gateway MAY cache the result keyed by the
scenario hash and step; the cache MUST be invalidated whenever either changes.

## 4. Renderer Obligations

`apps/web/src/rendering/canvas/workbench-stage.ts` MUST:

1. Draw each segment exactly as returned, vertex for vertex, with no resampling, curve fitting, or
   line connecting one segment to another.
2. Draw the ground before the bike so contact is visually unambiguous.
3. Never adjust the bike's position to meet the ground. If they disagree, that disagreement MUST be
   visible, because it indicates a real defect (FR-008).

## 5. Persistence

`terrainSampleStep` is stored in run model metadata. When replaying a stored run the renderer calls
`terrain(scenarioSnapshot, terrainSampleStep)`, reproducing precisely the surface that run was solved
against. The sampled segments are not stored, because they are exactly derivable.

## 6. Conformance Tests

| Test | Level |
| --- | --- |
| Native and WebAssembly `terrainProfileJson` produce identical output for the standard scenario | parity |
| Two repeated calls with identical scenario and step produce byte-identical output | determinism |
| Initial rear and front contact coordinates lie within the approach segment for every canonical scenario | regression |
| Gap scenarios have no collider, rendered edge, or queryable height between lip and landing | regression |
| Renderer-drawn segment and vertex counts and coordinates equal the returned profile | unit |
| For sampled points on each segment, simulated and drawn coordinates agree within `1e-6` m | contract |
| In every grounded frame, the lowest rendered wheel pixel is within 2 px of the drawn ground segment | visual |
| Changing `lipHeight`, `gap`, or `landingAngle` changes the drawn profile and solved contact together | e2e |
