import { useState, type InputHTMLAttributes } from "react";

type NumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "defaultValue" | "onChange"
> & {
  value: number;
  /** Called only with finite numbers; a cleared or partial entry is never committed. */
  onValueChange: (value: number) => void;
};

const display = (value: number): string => (Number.isFinite(value) ? String(value) : "");

/**
 * Number input that keeps the typed text locally so it can be cleared while editing,
 * commits only finite values, and restores the current value on blur.
 */
export const NumberInput = ({ value, onValueChange, onBlur, ...props }: NumberInputProps) => {
  const [text, setText] = useState(() => display(value));
  const [syncedValue, setSyncedValue] = useState(value);

  if (!Object.is(value, syncedValue)) {
    setSyncedValue(value);
    if (text.trim() === "" || !Object.is(Number(text), value)) setText(display(value));
  }

  return (
    <input
      {...props}
      type="number"
      value={text}
      onChange={(event) => {
        setText(event.currentTarget.value);
        const next = event.currentTarget.valueAsNumber;
        if (Number.isFinite(next)) onValueChange(next);
      }}
      onBlur={(event) => {
        if (!Number.isFinite(event.currentTarget.valueAsNumber)) setText(display(value));
        onBlur?.(event);
      }}
    />
  );
};
