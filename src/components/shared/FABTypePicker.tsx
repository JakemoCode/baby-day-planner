"use client";

import type { CreatableType } from "@/v3/components/shared/createEventTemplate";
import { BottomSheet } from "./BottomSheet";
import styles from "./FABTypePicker.module.css";

export type FABTypePickerProps = {
  open: boolean;
  onSelect: (type: CreatableType) => void;
  onCancel: () => void;
  /** Restrict which options are shown (order preserved). Defaults to all. */
  types?: readonly CreatableType[];
};

type Option = { type: CreatableType; label: string; sub: string };

const OPTIONS: ReadonlyArray<Option> = [
  { type: "bottle", label: "Bottle", sub: "Off-cycle feed" },
  { type: "pump", label: "Pump", sub: "Off-schedule pump" },
  { type: "extra", label: "Custom", sub: "Anything else" },
];

export function FABTypePicker({ open, onSelect, onCancel, types }: FABTypePickerProps) {
  const options = types ? OPTIONS.filter((o) => types.includes(o.type)) : OPTIONS;
  return (
    <BottomSheet open={open} title="Add an event" onCancel={onCancel}>
      <div className={styles.options} role="group">
        {options.map((opt) => (
          <button
            key={opt.type}
            type="button"
            className={styles.option}
            data-type={opt.type}
            onClick={() => onSelect(opt.type)}
          >
            <span className={styles.optionLabel}>{opt.label}</span>
            <span className={styles.optionSub}>{opt.sub}</span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
