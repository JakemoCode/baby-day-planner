"use client";

import { useId } from "react";
import type { Settings } from "@/domain";
import { DurationInput } from "@/components/shared/DurationInput";
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

  const updateDuration = (key: keyof NapDefaults) => (n: number) => {
    onChange({ ...value, [key]: n });
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
        <span className={styles.label}>Default nap length</span>
        <DurationInput
          id={ids.nap}
          className={styles.input}
          value={value.defaultNapLengthMinutes}
          onChange={updateDuration("defaultNapLengthMinutes")}
          min={0}
        />
      </label>

      <label className={styles.field} htmlFor={ids.short}>
        <span className={styles.label}>Short nap threshold</span>
        <span className={styles.hint}>
          Naps under this length trigger the wake-window adjustment below.
        </span>
        <DurationInput
          id={ids.short}
          className={styles.input}
          value={value.shortNapThresholdMinutes}
          onChange={updateDuration("shortNapThresholdMinutes")}
          min={0}
        />
      </label>

      <label className={styles.field} htmlFor={ids.adj}>
        <span className={styles.label}>Short nap adjustment</span>
        <span className={styles.hint}>Subtracted from the next wake window after a short nap.</span>
        <DurationInput
          id={ids.adj}
          className={styles.input}
          value={value.shortNapAdjustmentMinutes}
          onChange={updateDuration("shortNapAdjustmentMinutes")}
          min={0}
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
        <span className={styles.label}>Putdown lead time</span>
        <span className={styles.hint}>Heads-up shown this long before each projected nap.</span>
        <DurationInput
          id={ids.putdown}
          className={styles.input}
          value={value.putdownLeadMinutes}
          onChange={updateDuration("putdownLeadMinutes")}
          min={0}
        />
      </label>
    </section>
  );
}
