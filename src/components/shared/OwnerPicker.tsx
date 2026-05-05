"use client";

import type { Owner } from "@/domain";
import styles from "./OwnerPicker.module.css";

export type OwnerPickerProps = {
  value: Owner | undefined;
  onChange: (next: Owner | undefined) => void;
  label?: string;
};

const OPTIONS: { label: string; owner: Owner | undefined; cssKey: string }[] = [
  { label: "None", owner: undefined, cssKey: "option-none" },
  { label: "Jake", owner: "Jake", cssKey: "option-jake" },
  { label: "Kelly", owner: "Kelly", cssKey: "option-kelly" },
  { label: "Daycare", owner: "Daycare", cssKey: "option-daycare" },
];

export function OwnerPicker({ value, onChange, label }: OwnerPickerProps) {
  return (
    <div className={styles.field}>
      {label && <span className={styles.label}>{label}</span>}
      <div className={styles.group} role="group" aria-label={label ?? "Owner"}>
        {OPTIONS.map((opt) => {
          const pressed = value === opt.owner;
          return (
            <button
              key={opt.label}
              type="button"
              className={`${styles.option} ${styles[opt.cssKey] ?? ""}`}
              aria-pressed={pressed}
              onClick={() => onChange(opt.owner)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
