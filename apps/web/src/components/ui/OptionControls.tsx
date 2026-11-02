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
}: SingleOptionProps) => (
  <div className="segmented" role="group" aria-label={label}>
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        disabled={disabled}
        aria-pressed={option.value === value}
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </button>
    ))}
  </div>
);

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

type TabsProps = SingleOptionProps;

export const Tabs = ({ label, options, value, onChange }: TabsProps) => (
  <div
    className="tabs"
    role="tablist"
    aria-label={label}
    onKeyDown={(event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const currentIndex = options.findIndex((option) => option.value === value);
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const next = options[(currentIndex + delta + options.length) % options.length];
      if (next) {
        onChange(next.value);
        const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        buttons[(currentIndex + delta + options.length) % options.length]?.focus();
      }
    }}
  >
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        role="tab"
        aria-selected={option.value === value}
        tabIndex={option.value === value ? 0 : -1}
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </button>
    ))}
  </div>
);
