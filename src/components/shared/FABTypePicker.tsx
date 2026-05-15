"use client";

import { useEffect } from "react";
import type { CreatableType } from "@/v3/components/shared/createEventTemplate";
import styles from "./FABTypePicker.module.css";

export type FABTypePickerProps = {
  open: boolean;
  onSelect: (type: CreatableType) => void;
  onCancel: () => void;
};

type Option = { type: CreatableType; label: string; sub: string };

const OPTIONS: ReadonlyArray<Option> = [
  { type: "bottle", label: "Bottle", sub: "Off-cycle feed" },
  { type: "pump", label: "Pump", sub: "Off-schedule pump" },
  { type: "extra", label: "Custom", sub: "Anything else" },
];

export function FABTypePicker({ open, onSelect, onCancel }: FABTypePickerProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add an event"
        className={styles.sheet}
        onClick={(e) => e.stopPropagation()}
      >
        <span className={styles.handle} aria-hidden="true" />
        <h2 className={styles.title}>Add an event</h2>

        <div className={styles.options} role="group">
          {OPTIONS.map((opt) => (
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

        <button type="button" className={styles.cancel} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
