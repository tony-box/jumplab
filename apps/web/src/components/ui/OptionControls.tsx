import { handleRovingKeyDown, rovingTabIndex } from "./roving-focus";

type Option = { value: string; label: string };

type SingleOptionProps = {
  label: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export const SegmentedControl = ({
  label,
  options,
  value,
  onChange,
  disabled
}: SingleOptionProps) => {
  const anySelected = options.some((option) => option.value === value);
  return (
    <div
      className="segmented"
      role="group"
      aria-label={label}
      onKeyDown={(event) =>
        handleRovingKeyDown(event, "button[data-value]", (item) => {
          const next = item.dataset.value;
          if (next !== undefined && next !== value) onChange(next);
        })
      }
    >
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          data-value={option.value}
          disabled={disabled}
          aria-pressed={option.value === value}
          tabIndex={rovingTabIndex(option.value === value, index, anySelected)}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

type ChipSetProps = {
  label: string;
  options: Option[];
  values: string[];
  onChange: (values: string[]) => void;
};

export const ChipSet = ({ label, options, values, onChange }: ChipSetProps) => (
  <div className="chipset" role="group" aria-label={label}>
    {options.map((option) => {
      const selected = values.includes(option.value);
      return (
        <button
          className="chip"
          key={option.value}
          type="button"
          aria-pressed={selected}
          onClick={() =>
            onChange(
              selected
                ? values.filter((value) => value !== option.value)
                : [...values, option.value]
            )
          }
        >
          {option.label}
        </button>
      );
    })}
  </div>
);
