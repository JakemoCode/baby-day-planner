"use client";

import styles from "./SettingsField.module.css";

export type PumpTimesEditorProps = {
  value: string[];
  onChange: (next: string[]) => void;
};

export function PumpTimesEditor({ value, onChange }: PumpTimesEditorProps) {
  const update = (index: number, time: string) => {
    const next = [...value];
    next[index] = time;
    onChange(next);
  };

  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const append = () => onChange([...value, "12:00"]);

  return (
    <section className={styles.section} aria-labelledby="pump-times-h">
      <header className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle} id="pump-times-h">
          Pump times
        </h3>
        <button type="button" className={styles.button} onClick={append}>
          + Add pump time
        </button>
      </header>
      <p className={styles.sectionDescription}>
        Standard pump times that appear on the timeline. They don&apos;t affect the baby&apos;s
        schedule projection.
      </p>

      {value.length === 0 ? (
        <p className={styles.empty}>No pump times configured.</p>
      ) : (
        <div className={styles.list}>
          {value.map((time, i) => {
            const inputId = `pump-time-${i}`;
            return (
              <div key={i} className={styles.row}>
                <label className={styles.field} htmlFor={inputId} style={{ flex: 1 }}>
                  <span className={styles.label}>Pump time {i + 1}</span>
                  <input
                    id={inputId}
                    type="time"
                    className={styles.input}
                    value={time}
                    onChange={(e) => update(i, e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className={styles.dangerButton}
                  aria-label={`Remove pump time ${i + 1}`}
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
