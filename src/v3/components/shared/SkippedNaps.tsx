"use client";

import { useId } from "react";
import styles from "./SkippedNaps.module.css";

export type SkippedNapsProps = {
  /** `Day.suppressedNapKeys` (R3.11), e.g. `["nap_2"]`. */
  napKeys: string[];
  onRestore: (napKey: string) => void;
};

const slotOf = (napKey: string) => Number(napKey.replace("nap_", ""));

/** Undo for deleting a projected nap: a deleted nap no longer renders, so restore lives here. */
export function SkippedNaps({ napKeys, onRestore }: SkippedNapsProps) {
  const labelId = useId();
  if (napKeys.length === 0) return null;
  const sorted = [...napKeys].sort((a, b) => slotOf(a) - slotOf(b));

  return (
    <section className={styles.card} aria-labelledby={labelId}>
      <h2 id={labelId} className={styles.label}>
        Deleted today
      </h2>
      <div className={styles.actions}>
        {sorted.map((key) => (
          <button key={key} type="button" className={styles.restore} onClick={() => onRestore(key)}>
            Restore Nap {slotOf(key)}
          </button>
        ))}
      </div>
    </section>
  );
}
