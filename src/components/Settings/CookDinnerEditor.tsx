"use client";

import { useId } from "react";
import styles from "./SettingsField.module.css";

export type CookDinnerSettings = {
  enabled: boolean;
  time: string;
};

export type CookDinnerEditorProps = {
  value: CookDinnerSettings;
  onChange: (next: CookDinnerSettings) => void;
};

/**
 * Recurring "Cook Dinner" reminder. When enabled, the engine emits a
 * projected event each day at the configured time. Toggle off to suppress
 * for all days; per-day editing happens via the timeline drawer.
 */
export function CookDinnerEditor({ value, onChange }: CookDinnerEditorProps) {
  const ids = { enabled: useId(), time: useId() };

  return (
    <section className={styles.section} aria-labelledby={`${ids.enabled}-h`}>
      <header className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle} id={`${ids.enabled}-h`}>
          Cook Dinner
        </h3>
      </header>
      <p className={styles.sectionDescription}>
        Daily dinner-prep reminder. Renders as a chip on the timeline.
      </p>

      <label className={styles.row} htmlFor={ids.enabled}>
        <input
          id={ids.enabled}
          type="checkbox"
          className={styles.checkbox}
          checked={value.enabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
        />
        <span className={styles.label}>Enabled</span>
      </label>

      <label className={styles.field} htmlFor={ids.time}>
        <span className={styles.label}>Time</span>
        <input
          id={ids.time}
          type="time"
          className={styles.input}
          value={value.time}
          disabled={!value.enabled}
          onChange={(e) => onChange({ ...value, time: e.target.value })}
        />
      </label>
    </section>
  );
}
