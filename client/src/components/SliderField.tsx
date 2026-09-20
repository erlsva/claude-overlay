import { useState } from "react";

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}

/** A slider with an editable number beside it, so a value can be dragged or typed. */
export function SliderField({
  label,
  value,
  min,
  max,
  step,
  unit = "",
  onChange,
}: SliderFieldProps) {
  // Keep what is being typed separate, so half-typed numbers are not clamped mid-keystroke.
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (text: string) => {
    setDraft(null);
    const parsed = Number(text);
    if (text.trim() === "" || !Number.isFinite(parsed)) return;
    const clamped = Math.min(max, Math.max(min, parsed));
    onChange(Number.isInteger(step) ? Math.round(clamped) : clamped);
  };

  return (
    <label className="chat-emote-range">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="value-field">
        <input
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={draft ?? String(value)}
          aria-label={`${label}${unit ? ` in ${unit}` : ""}`}
          onChange={(event) => {
            const text = event.target.value;
            setDraft(text);
            // Arrow keys and the spinner are not typing, so apply them straight away.
            if (!(event.nativeEvent instanceof InputEvent)) commit(text);
          }}
          onBlur={(event) => draft !== null && commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraft(null);
              event.currentTarget.blur();
            }
          }}
        />
        <small aria-hidden="true">{unit}</small>
      </span>
    </label>
  );
}
