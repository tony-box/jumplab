import type { BikeSpec } from "../../../../../packages/schema/src/index";
import { handleRovingKeyDown, NumberInput, rovingTabIndex } from "../../components/ui";
import { bikeDimensionGroupsFor, type BikeDimensionPath } from "./bike-dimensions";

const frameTypes = [
  "rigid",
  "hardtail",
  "full"
] as const satisfies readonly BikeSpec["frameType"][];

type BikeGeometryRailProps = {
  bike: BikeSpec;
  values: Record<BikeDimensionPath, number>;
  issues: Array<{ fields: string[]; message: string }>;
  status: "idle" | "pending" | "valid" | "invalid" | "error";
  onValueChange: (path: BikeDimensionPath, value: number) => void;
  onFrameTypeChange: (frameType: BikeSpec["frameType"]) => void;
};

export const BikeGeometryRail = ({
  bike,
  values,
  issues,
  status,
  onValueChange,
  onFrameTypeChange
}: BikeGeometryRailProps) => (
  <aside
    className="rail bike-geometry-rail"
    data-od-id="bike-geometry-rail"
    aria-label="Bike geometry controls"
  >
    <section className="control-group">
      <h2>Frame type</h2>
      <div
        className="segmented"
        role="radiogroup"
        aria-label="Frame type"
        onKeyDown={(event) =>
          handleRovingKeyDown(event, '[role="radio"]', (item) => {
            const next = frameTypes.find((frameType) => frameType === item.dataset.value);
            if (next && next !== bike.frameType) onFrameTypeChange(next);
          })
        }
      >
        {frameTypes.map((frameType, index) => (
          <button
            key={frameType}
            type="button"
            role="radio"
            data-value={frameType}
            aria-checked={bike.frameType === frameType}
            tabIndex={rovingTabIndex(
              bike.frameType === frameType,
              index,
              frameTypes.includes(bike.frameType)
            )}
            onClick={() => onFrameTypeChange(frameType)}
          >
            {frameType === "full"
              ? "Full suspension"
              : frameType[0]?.toUpperCase() + frameType.slice(1)}
          </button>
        ))}
      </div>
      <p className="rail-note" role="status">
        {status === "pending"
          ? "Checking bike geometry"
          : status === "invalid"
            ? "Draft retained. Correct the supported range or geometry issue."
            : "Bike geometry is applied at scenario level."}
      </p>
    </section>

    {bikeDimensionGroupsFor(bike).map((group) => (
      <section className="control-group" key={group.id}>
        <h2>{group.label}</h2>
        {group.note ? <p className="rail-note">{group.note}</p> : null}
        {group.fields.map((field) => {
          const fieldIssues = issues.filter((issue) => issue.fields.includes(field.path));
          const issueId = `bike-dimension-${field.path.replaceAll(".", "-")}-issue`;
          return (
            <label className="bike-number-field" key={field.path}>
              <span>{field.label}</span>
              <span className="bike-number-input">
                <NumberInput
                  id={`bike-dimension-${field.path.replaceAll(".", "-")}`}
                  data-od-id={`bike-dimension-${field.path}`}
                  value={values[field.path]}
                  min={field.minimum}
                  max={field.maximum}
                  step={field.step}
                  aria-label={field.label}
                  aria-invalid={fieldIssues.length > 0}
                  aria-describedby={fieldIssues.length > 0 ? issueId : undefined}
                  onValueChange={(value) => onValueChange(field.path, value)}
                />
                <small>{field.unit}</small>
              </span>
              <small>{field.description}</small>
              {fieldIssues.map((issue) => (
                <small id={issueId} className="field-issue" key={issue.message}>
                  {issue.message}
                </small>
              ))}
            </label>
          );
        })}
      </section>
    ))}
  </aside>
);
