"use client";

import { DurationInput } from "@/components/shared/DurationInput";
import styles from "./SettingsField.module.css";

export type WakeWindowsEditorProps = {
  value: number[];
  onChange: (next: number[]) => void;
};

export function WakeWindowsEditor({ value, onChange }: WakeWindowsEditorProps) {
  const update = (index: number, minutes: number) => {
    const next = [...value];
    next[index] = minutes;
    onChange(next);
  };

  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const append = () => {
    const last = value[value.length - 1] ?? 120;
    onChange([...value, last]);
  };

  return (
    <section className={styles.section} aria-labelledby="wake-windows-h">
      <header className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle} id="wake-windows-h">
          Wake windows
        </h3>
        <button type="button" className={styles.button} onClick={append}>
          + Add window
        </button>
      </header>
      <p className={styles.sectionDescription}>
        Time awake before each nap. The number of windows determines the number of naps in the
        projected day.
      </p>

      {value.length === 0 ? (
        <p className={styles.empty}>No wake windows yet — add one to start the schedule.</p>
      ) : (
        <div className={styles.list}>
          {value.map((minutes, i) => {
            const inputId = `ww-input-${i}`;
            return (
              <div key={i} className={styles.row}>
                <label className={styles.field} htmlFor={inputId} style={{ flex: 1 }}>
                  <span className={styles.label}>Wake Window {i + 1}</span>
                  <DurationInput
                    id={inputId}
                    className={styles.input}
                    value={minutes}
                    onChange={(n) => update(i, n)}
                    min={0}
                  />
                </label>
                <button
                  type="button"
                  className={styles.dangerButton}
                  aria-label={`Remove Wake Window ${i + 1}`}
                  onClick={() => remove(i)}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
