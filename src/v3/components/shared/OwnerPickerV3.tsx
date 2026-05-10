"use client";

import styles from "./OwnerPicker.module.css";
import type { OwnerRef, OwnersConfig } from "../../schemas";
import { ownerRefEquals } from "../../schemas";
import { ownerColor } from "../../ui/owners";

export type OwnerPickerV3Props = {
  owners: OwnersConfig;
  value: OwnerRef | undefined;
  onChange: (next: OwnerRef | undefined) => void;
  label?: string;
};

type Option = { displayName: string; ref: OwnerRef | undefined; slotKey: string };

function buildOptions(owners: OwnersConfig): Option[] {
  return [
    { displayName: "None", ref: undefined, slotKey: "none" },
    { displayName: owners.parent1.displayName, ref: { slot: "parent1" }, slotKey: "parent1" },
    { displayName: owners.parent2.displayName, ref: { slot: "parent2" }, slotKey: "parent2" },
    ...owners.other.map<Option>((o) => ({
      displayName: o.displayName,
      ref: { slot: "other", otherId: o.id },
      slotKey: `other:${o.id}`,
    })),
  ];
}

function isSelected(value: OwnerRef | undefined, ref: OwnerRef | undefined): boolean {
  if (value === undefined && ref === undefined) return true;
  if (value === undefined || ref === undefined) return false;
  return ownerRefEquals(value, ref);
}

export function OwnerPickerV3({ owners, value, onChange, label }: OwnerPickerV3Props) {
  const options = buildOptions(owners);
  return (
    <div className={styles.field}>
      {label && <span className={styles.label}>{label}</span>}
      <div className={styles.group} role="group" aria-label={label ?? "Owner"}>
        {options.map((opt) => {
          const pressed = isSelected(value, opt.ref);
          const color = ownerColor(opt.ref, owners);
          return (
            <button
              key={opt.slotKey}
              type="button"
              className={styles.option}
              data-owner={opt.slotKey}
              aria-pressed={pressed}
              style={color ? ({ "--owner-color": color } as React.CSSProperties) : undefined}
              onClick={() => onChange(opt.ref)}
            >
              {opt.displayName}
            </button>
          );
        })}
      </div>
    </div>
  );
}
