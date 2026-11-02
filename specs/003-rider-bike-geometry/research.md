# Phase 0 Research: Coherent Rider and Bike Geometry

## Decision 1: Keep pose sampling authoritative in the physics core

**Decision**: Extend `crates/physics-core/src/pose.rs::sample_pose` as the only authority for keyframe interpolation, joint clamping, full side-plane rider kinematics, contact points, and derived shoulder/elbow angles. The achieved rider is built from a pedal-anchored leg chain and a handlebar-constrained two-link arm chain using the segment lengths already owned by Rust. The elbow remains calculated and is not added to authored `PoseKey.targets`.

**Rationale**: The existing sampler already implements all three interpolation modes and arm reach, while `geometry.rs` owns rider segment lengths. Extending that boundary prevents TypeScript from becoming an authoritative kinematics implementation, makes foot and hand contacts testable before rendering, avoids Scenario migration, and satisfies the clarification that users do not author an independent elbow target.

**Alternatives considered**:

- Recalculate body landmarks in each Canvas renderer: rejected because Pose and Workbench could diverge and visuals would be repairing physical state.
- Add elbow to movement keyframes: rejected because it creates conflicting reach constraints and unnecessary compatibility work.
- Implement a second TypeScript interpolation path for Workbench: rejected because it duplicates physics-core behavior and weakens replay reproducibility.

## Decision 2: Make each new run frame self-contained for rider replay

**Decision**: Append the sampled `ankle`, `knee`, `hip`, and `spine` targets plus achieved rider/contact landmark coordinates to each solver frame after the existing shoulder and elbow values. Keep frame layout version 1 and expose fields by name through the existing `FrameLayout`; increase the stride for new runs while allowing readers to fall back gracefully when older layouts omit these fields.

**Rationale**: The solver already samples every output frame. Persisting both achieved values and landmarks makes immutable runs reproduce the exact constrained posture without render-time physics calls or duplicated forward kinematics. The existing buffer reader locates fields by name, so additive fields are compatible with old stored and fixture artifacts.

**Alternatives considered**:

- Re-sample the active scenario while replaying a run: rejected because a run must render its immutable scenario result, not current mutable scenario state, and rendering must not invoke the solver.
- Store a separate pose buffer: rejected because a second synchronized buffer adds lifecycle and indexing complexity with no current need.
- Bump the frame layout version: rejected because the contract already supports additive named fields and no field meaning changes.

## Decision 3: Share one web rendering adapter without moving kinematics into TypeScript

**Decision**: Add pure, side-effect-free rendering adapters and bicycle path builders under `apps/web/src/rendering/geometry/`. Both Pose and Workbench consume the same physics-returned rider/contact landmarks and shared drawing primitives. TypeScript derives only representative frame, saddle, crank, fork, and steering paths around those authoritative contacts. Geometry is expressed in meters in a bike-local coordinate system with positive x forward and positive y upward; Workbench applies frame translation and pitch only after adapting the landmarks.

**Rationale**: Shared adapters eliminate the independent drawings currently embedded in both Canvas stages while respecting the documented physics-core ownership boundary. Rust tests prove human connectivity and contacts; fast TypeScript tests prove representative bicycle topology and rendering parity without Canvas.

**Alternatives considered**:

- Keep geometry construction inside each stage: rejected because it caused the current cross-view mismatch.
- Move frame tubes, saddle shape, paired-limb offsets, and drawing paths into Rust: rejected because those are representative presentation concerns rather than solver state.
- Introduce a scene graph or 3D dependency: rejected as unnecessary for a fixed-size side-view 2D model.

## Decision 4: Split rider dimensions into deterministic segment proportions

**Decision**: Rust reuses the physical segment ratios already documented by `derive_rider_segments`: thigh is 53% and shank is 47% of `height * legRatio`; upper arm is 55% and forearm is 45% of `height * armRatio`. It returns one logical skeleton containing pedal/foot, ankle, knee, hip/pelvis, shoulder, elbow, hand, and head landmarks. Both displayed arms and both displayed legs share that state; TypeScript may apply a small visual-only far-pair offset that cannot alter logical contacts, values, or physical meaning.

**Rationale**: Matching established segment ratios gives the canvases coherent anatomy without adding configuration. A shared pose state honors the focused 2D model and the accepted clarification while still producing a recognizable human silhouette.

**Alternatives considered**:

- Draw only one arm and leg: rejected because users requested recognizable human geometry.
- Add independent near/far limb controls: rejected because the schema and solver model one side-plane state and the feature excludes new physical controls.
- Use arbitrary pixel lengths: rejected because proportions would change with viewport and disagree with rider dimensions.

## Decision 5: Use existing bike dimensions plus documented schematic proportions

**Decision**: Use a bike-local origin at the bottom-bracket x coordinate and axle height, matching the solver's rear/front clearance offsets. Rust derives authoritative handlebar and active pedal contacts from `wheelSize`, `wheelbase`, `chainstay`, and `bbHeight` plus documented fixed-model contact proportions; those contacts drive the rider chains and are returned with every sample. TypeScript derives the remaining frame-tube, saddle, steering, crank-shape, and fork paths from deterministic representative ratios around those exact contacts.

**Rationale**: The current schema lacks full bicycle-fit dimensions, but recognizable geometry is still necessary for comprehension. Deterministic schematic proportions avoid new unsupported controls and ensure every valid BikeSpec yields finite, connected landmarks.

**Alternatives considered**:

- Omit landmarks not explicitly measured: rejected because the result remains an unrecognizable triangle.
- Add complete bicycle-fit fields now: rejected because they would imply solver-supported physical inputs and require schema, UI, preset, and migration work outside this feature.
- Use one fixed-size bike drawing: rejected because it would ignore active wheel and frame dimensions.

## Decision 6: Treat static suspension shape honestly

**Decision**: Render rigid, hardtail, and full-suspension frame topology from `frameType`, and use configured travel/sag only for a static representative suspension shape unless measured compression fields become available. Do not animate fork or rear-shock compression from contact impulse or invented proxies. Existing suspension overlays may identify configured components but must not imply measured travel.

**Rationale**: Current run frames contain no fork or rear-shock compression. Invented motion would violate source honesty and the constitution's rule that animation represents simulation state.

**Alternatives considered**:

- Infer compression from contact impulse: rejected because no validated mapping exists.
- Expand physics scope to model suspension compression in this feature: rejected because it materially enlarges solver validation and is not required to fix rider/bike geometry.
- Hide suspension differences entirely: rejected because frame type and configured suspension are existing inspectable inputs.

## Decision 7: Preserve measured, calculated, and representative source classes

**Decision**: Classify frame position/pitch and sampled joint values as solver-derived run state; classify rider landmarks as calculated from solver state and scenario dimensions; classify missing bicycle-fit landmarks as representative schematic geometry. User-facing stage copy or legend must disclose the schematic nature once per relevant view without labeling every line.

**Rationale**: This keeps the stage readable while preventing representative proportions from being interpreted as measured fit or suspension behavior.

**Alternatives considered**:

- Label every landmark: rejected because it obscures the educational visualization.
- Use no disclosure: rejected because users could mistake typical saddle/handlebar placement for scenario data.
- Mark all geometry as representative: rejected because it would understate actual solver-derived pose and bike dimensions.

## Decision 8: Define numeric contracts before screenshot baselines

**Decision**: Test Rust landmark finiteness, connectivity, segment lengths, limits, and contacts numerically before visual snapshots. Use `1e-5 m` for geometry equality and connectivity, `1e-4 rad` for the same sampled joint value across data boundaries, and a maximum `0.05 rad` adjacent-frame delta in dedicated continuous interpolation fixtures. Step interpolation is exempt from continuity at authored boundaries. Keep the repository's 2% screenshot tolerance for anti-aliasing differences and require canvas pixel/nonblank plus overflow checks at desktop and iPad Pro 11 viewports.

**Rationale**: Numeric contracts detect structural defects that screenshots cannot diagnose, while browser evidence catches framing, layering, clipping, and recognizability regressions. Separate tolerances distinguish deterministic math from rasterization.

**Alternatives considered**:

- Screenshot-only validation: rejected because matching pixels do not prove contacts or segment lengths.
- Zero-tolerance screenshots: rejected because browser anti-aliasing differs by engine and device scale.
- A 2 cm geometry tolerance everywhere: rejected because pure shared calculations should agree much more closely; centimeter tolerance would hide defects.

## Decision 9: Keep browser workflows and accessibility contracts stable

**Decision**: Preserve existing Pose and Workbench routes, primary actions, stage dimensions, keyboard interactions, Canvas accessible names, and `data-od-id` regions. Add deterministic test-hook geometry checkpoints containing source values and bike-local landmarks; do not expose mutable production state or rely on fixed sleeps.

**Rationale**: The feature changes stage content, not workflow. Structured checkpoints allow exact cross-view comparison and stable synchronization while existing Playwright screenshots verify the final rendered result.

**Alternatives considered**:

- Add a new geometry inspector panel: rejected as scope and layout expansion.
- Inspect private Canvas implementation details from Playwright: rejected because it creates brittle tests.
- Synchronize with elapsed delays: rejected by the constitution and existing test conventions.

## Decision 10: Normalize joint conventions and clamping in Rust

**Decision**: Document one canonical side-plane convention in `docs/physics/model.md`: positive knee and elbow values represent flexion; ankle, hip, spine, and shoulder signs are defined against named bike-local segment axes. Clamp all interpolated targets and derived arm values to the active RiderSpec limits inside `sample_pose`, return the achieved values and a named constrained state, and remove the TypeScript layer's authority to change sampled values. Correct canonical fixtures and presets whose limits use the opposite sign from their authored flexion targets; arbitrary existing valid scenarios still load unchanged and preserve authored targets, but out-of-limit values yield a constrained achieved pose.

**Rationale**: The current standard fixture authors knee flexion near `+1 rad` while declaring a maximum of `+0.1 rad`; Pose clamps that in TypeScript but solver frames retain the raw value. Centralizing convention and clamping is required for physical ownership, credible neutral posture, and exact cross-view parity.

**Alternatives considered**:

- Keep TypeScript sanitization as authoritative: rejected because Workbench and stored runs disagree with Pose.
- Silently reinterpret every legacy limit by sign: rejected because it changes valid user data without an explicit schema version.
- Ignore RiderSpec limits while drawing: rejected because it violates the constraint contract.

## Resolved Unknowns

All Technical Context unknowns are resolved. No dependency, schema migration, network service, security boundary, or new physical control is required.
