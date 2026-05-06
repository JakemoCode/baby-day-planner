"use client";

import { useId } from "react";
import type { DreamFeedSettings } from "@/domain";
import styles from "./SettingsField.module.css";

export type DreamFeedEditorProps = {
  value: DreamFeedSettings;
  onChange: (next: DreamFeedSettings) => void;
};

export function DreamFeedEditor({ value, onChange }: DreamFeedEditorProps) {
  const ids = {
    enabled: useId(),
    earliest: useId(),
    latest: useId(),
    minAfter: useId(),
  };

  const update = (patch: Partial<DreamFeedSettings>) => onChange({ ...value, ...patch });

  return (
    <section className={styles.section} aria-labelledby={`${ids.enabled}-h`}>
      <header className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle} id={`${ids.enabled}-h`}>
          Dream feed
        </h3>
      </header>
      <p className={styles.sectionDescription}>
        Optional late-evening feed scheduled after bedtime.
      </p>

      <label className={styles.row} htmlFor={ids.enabled}>
        <input
          id={ids.enabled}
          type="checkbox"
          className={styles.checkbox}
          checked={value.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
        />
        <span className={styles.label}>Enabled</span>
      </label>

      <label className={styles.field} htmlFor={ids.earliest}>
        <span className={styles.label}>Earliest time</span>
        <input
          id={ids.earliest}
          type="time"
          className={styles.input}
          value={value.earliestTime}
          disabled={!value.enabled}
          onChange={(e) => update({ earliestTime: e.target.value })}
        />
      </label>

      <label className={styles.field} htmlFor={ids.latest}>
        <span className={styles.label}>Latest time</span>
        <span className={styles.hint}>Cap. The dream feed will never project past this time.</span>
        <input
          id={ids.latest}
          type="time"
          className={styles.input}
          value={value.latestTime}
          disabled={!value.enabled}
          onChange={(e) => update({ latestTime: e.target.value })}
        />
      </label>

      <label className={styles.field} htmlFor={ids.minAfter}>
        <span className={styles.label}>Minimum minutes after bedtime</span>
        <input
          id={ids.minAfter}
          type="number"
          min="0"
          className={styles.input}
          value={value.minMinutesAfterBedtime}
          disabled={!value.enabled}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) update({ minMinutesAfterBedtime: n });
          }}
        />
      </label>
    </section>
  );
}
