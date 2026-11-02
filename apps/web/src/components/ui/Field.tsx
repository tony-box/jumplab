import type { CSSProperties, InputHTMLAttributes } from "react";

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "value"> & {
  id: string;
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  step: number;
  unit: string;
  explanation?: string;
  disabledReason?: string;
  /** Sub-span of the track currently selectable, when narrower than min..max. */
  reachableRange?: { min: number; max: number };
  onChange: (value: number) => void;
};

const percentOf = (value: number, minimum: number, maximum: number): number =>
  Math.min(100, Math.max(0, ((value - minimum) / Math.max(1e-9, maximum - minimum)) * 100));

export const Field = ({
  id,
  label,
  value,
  minimum,
  maximum,
  step,
  unit,
  explanation,
  disabledReason,
  reachableRange,
  disabled,
  onChange,
  ...props
}: FieldProps) => (
  <div className="field" title={disabledReason ?? explanation}>
    <div className="field-row">
      <label htmlFor={id}>{label}</label>
      <output className="field-value" htmlFor={id}>
        {value.toFixed(step < 0.1 ? 2 : 1)} {unit}
      </output>
    </div>
    <input
      {...props}
      id={id}
      type="range"
      className={reachableRange ? "reach-track" : undefined}
      data-od-id={reachableRange ? `${id}-reach` : undefined}
      style={
        reachableRange
          ? ({
              "--reach-start": `${percentOf(reachableRange.min, minimum, maximum)}%`,
              "--reach-end": `${percentOf(reachableRange.max, minimum, maximum)}%`
            } as CSSProperties)
          : undefined
      }
      min={minimum}
      max={maximum}
      step={step}
      value={value}
      disabled={disabled}
      aria-describedby={disabledReason || explanation ? `${id}-explanation` : undefined}
      onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
    />
    {disabledReason || explanation ? (
      <span id={`${id}-explanation`} className="sr-only">
        {disabledReason ?? explanation}
      </span>
    ) : null}
  </div>
);
