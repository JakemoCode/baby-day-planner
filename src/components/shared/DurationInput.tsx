"use client";

import { useState } from "react";
import { formatMinutesAsHHMM, parseHHMMToMinutes } from "./duration";

export type DurationInputProps = {
  id?: string;
  value: number;
  onChange: (minutes: number) => void;
  className?: string | undefined;
  ariaLabel?: string;
  min?: number;
  disabled?: boolean;
};

/**
 * Duration input that displays minutes as h:mm. Accepts either "1:25" or
 * a bare number ("85", treated as minutes). Commits on blur; while focused,
 * lets the user type freely without snapping the value back. If the typed
 * string isn't valid at blur, reverts to the last good value.
 */
export function DurationInput({
  id,
  value,
  onChange,
  className,
  ariaLabel,
  min,
  disabled,
}: DurationInputProps) {
  // null = not editing → derive display from `value` directly so external
  // updates flow through. While editing, hold the user's keystrokes verbatim
  // until they blur.
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? formatMinutesAsHHMM(value);

  return (
    <input
      {...(id !== undefined ? { id } : {})}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      {...(className !== undefined ? { className } : {})}
      {...(ariaLabel !== undefined ? { "aria-label": ariaLabel } : {})}
      {...(disabled ? { disabled: true } : {})}
      value={display}
      onFocus={() => setDraft(formatMinutesAsHHMM(value))}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const parsed = parseHHMMToMinutes(draft ?? "");
        setDraft(null);
        if (parsed === null) return;
        if (min !== undefined && parsed < min) return;
        if (parsed !== value) onChange(parsed);
      }}
    />
  );
}
