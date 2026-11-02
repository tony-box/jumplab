import type { BikeGeometryInspection } from "../../../../../packages/schema/src/index";

export const BikeDerivedRail = ({ inspection }: { inspection: BikeGeometryInspection | null }) => (
  <aside
    className="rail bike-derived-rail"
    data-od-id="bike-derived-rail"
    aria-label="Bike summary"
  >
    <section className="control-group">
      <h2>Bike summary</h2>
      <dl className="derived-readouts">
        <div>
          <dt>Frame alignment</dt>
          <dd>{inspection ? `${(inspection.closureResidual * 1000).toFixed(1)} mm` : "Pending"}</dd>
        </div>
        <div>
          <dt>Total mass</dt>
          <dd>{inspection ? `${inspection.massProperties.totalMass.toFixed(1)} kg` : "Pending"}</dd>
        </div>
        <div>
          <dt>Balance point</dt>
          <dd>
            {inspection
              ? `${inspection.massProperties.centerOfGravity.x.toFixed(3)}, ${inspection.massProperties.centerOfGravity.y.toFixed(3)} m`
              : "Pending"}
          </dd>
        </div>
        <div>
          <dt>Planar inertia</dt>
          <dd>
            {inspection ? `${inspection.massProperties.planarInertia.toFixed(3)} kg.m2` : "Pending"}
          </dd>
        </div>
      </dl>
    </section>
  </aside>
);
