"use client";

import type { Event, Owner } from "@/domain";
import { formatTimeForDisplay } from "@/domain";
import styles from "./TemplateOwnerPicker.module.css";

const OWNERS: Owner[] = ["Jake", "Kelly", "Daycare"];

export type TemplateOwnerPickerProps = {
  event: Event;
  onSelect: (owner: Owner) => void;
  onCancel: () => void;
};

export function TemplateOwnerPicker({ event, onSelect, onCancel }: TemplateOwnerPickerProps) {
  const range = event.endTime
    ? `${formatTimeForDisplay(event.startTime)}–${formatTimeForDisplay(event.endTime)}`
    : formatTimeForDisplay(event.startTime);

  return (
    <div className={styles.panel} role="dialog" aria-label={`Assign owner for ${event.label}`}>
      <div className={styles.header}>
        <span className={styles.label}>{event.label}</span>
        <span className={styles.range}>{range}</span>
        <button
          type="button"
          className={styles.close}
          aria-label="Cancel owner assignment"
          onClick={onCancel}
        >
          ×
        </button>
      </div>
      <div className={styles.options} role="group" aria-label="Owner">
        {OWNERS.map((owner) => {
          const selected = event.owner === owner;
          return (
            <button
              key={owner}
              type="button"
              data-owner={owner.toLowerCase()}
              className={selected ? styles.optionSelected : styles.option}
              aria-pressed={selected}
              onClick={() => onSelect(owner)}
            >
              {owner}
            </button>
          );
        })}
      </div>
    </div>
  );
}
