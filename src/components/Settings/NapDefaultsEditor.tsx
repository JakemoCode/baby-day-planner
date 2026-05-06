"use client";

import { useId } from "react";
import type { Settings } from "@/domain";
import styles from "./SettingsField.module.css";

export type NapDefaults = Pick<
  Settings,
  | "defaultNapLengthMinutes"
  | "shortNapThresholdMinutes"
  | "shortNapAdjustmentMinutes"
  | "bedtimeThreshold"
  | "putdownLeadMinutes"
>;

export type NapDefaultsEditorProps = {
  value: NapDefaults;
  onChange: (next: NapDefaults) => void;
};

export function NapDefaultsEditor({ value, onChange }: NapDefaultsEditorProps) {
  const ids = {
    nap: useId(),
    short: useId(),
    adj: useId(),
    bedtime: useId(),
    putdown: useId(),
  };

  const updateNumber = (key: keyof NapDefaults) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = Number(e.target.value);
    if (Number.isFinite(n)) onChange({ ...value, [key]: n });
  };

  return (
    <section className={styles.section} aria-labelledby={`${ids.nap}-h`}>
      <header className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle} id={`${ids.nap}-h`}>
          Nap defaults
        </h3>
      </header>
      <p className={styles.sectionDescription}>
        Used by the schedule projection until actual naps are recorded.
      </p>

      <label className={styles.field} htmlFor={ids.nap}>
        <span className={styles.label}>Default nap length (minutes)</span>
        <input
          id={ids.nap}
          type="number"
          min="0"
          className={styles.input}
          value={value.defaultNapLengthMinutes}
          onChange={updateNumber("defaultNapLengthMinutes")}
        />
      </label>

      <label className={styles.field} htmlFor={ids.short}>
        <span className={styles.label}>Short nap threshold (minutes)</span>
        <span className={styles.hint}>
          Naps under this length trigger the wake-window adjustment below.
        </span>
        <input
          id={ids.short}
          type="number"
          min="0"
          className={styles.input}
          value={value.shortNapThresholdMinutes}
          onChange={updateNumber("shortNapThresholdMinutes")}
        />
      </label>

      <label className={styles.field} htmlFor={ids.adj}>
        <span className={styles.label}>Short nap adjustment (minutes)</span>
        <span className={styles.hint}>Subtracted from the next wake window after a short nap.</span>
        <input
          id={ids.adj}
          type="number"
          min="0"
          className={styles.input}
          value={value.shortNapAdjustmentMinutes}
          onChange={updateNumber("shortNapAdjustmentMinutes")}
        />
      </label>

      <label className={styles.field} htmlFor={ids.bedtime}>
        <span className={styles.label}>Bedtime threshold</span>
        <span className={styles.hint}>Projected naps at or after this time become Bedtime.</span>
        <input
          id={ids.bedtime}
          type="time"
          className={styles.input}
          value={value.bedtimeThreshold}
          onChange={(e) => onChange({ ...value, bedtimeThreshold: e.target.value })}
        />
      </label>

      <label className={styles.field} htmlFor={ids.putdown}>
        <span className={styles.label}>Putdown lead time (minutes)</span>
        <span className={styles.hint}>
          Heads-up shown this many minutes before each projected nap.
        </span>
        <input
          id={ids.putdown}
          type="number"
          min="0"
          className={styles.input}
          value={value.putdownLeadMinutes}
          onChange={updateNumber("putdownLeadMinutes")}
        />
      </label>
    </section>
  );
}
