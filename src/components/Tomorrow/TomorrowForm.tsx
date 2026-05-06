"use client";

import { useId } from "react";
import type { Event, OwnershipTemplate } from "@/domain";
import { formatTimeForDisplay } from "@/domain";
import styles from "./TomorrowForm.module.css";

export type TomorrowFormState = {
  wakeTime: string;
  bottle1Time?: string;
  templateId?: string;
  extras: Event[];
};

export type TomorrowFormProps = {
  value: TomorrowFormState;
  templates: OwnershipTemplate[];
  onChange: (next: TomorrowFormState) => void;
  onAddExtra: () => void;
  onEditExtra: (event: Event) => void;
  onRemoveExtra: (id: string) => void;
};

export function TomorrowForm({
  value,
  templates,
  onChange,
  onAddExtra,
  onEditExtra,
  onRemoveExtra,
}: TomorrowFormProps) {
  const wakeId = useId();
  const bottleId = useId();
  const templateId = useId();

  const update = (patch: Partial<TomorrowFormState>) => onChange({ ...value, ...patch });

  return (
    <div className={styles.form}>
      <label className={styles.field} htmlFor={wakeId}>
        <span className={styles.label}>Wake time</span>
        <input
          id={wakeId}
          type="time"
          className={styles.input}
          value={value.wakeTime}
          onChange={(e) => update({ wakeTime: e.target.value })}
          required
        />
      </label>

      <label className={styles.field} htmlFor={bottleId}>
        <span className={styles.label}>Bottle 1 time (optional)</span>
        <input
          id={bottleId}
          type="time"
          className={styles.input}
          value={value.bottle1Time ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v) update({ bottle1Time: v });
            else {
              const { bottle1Time: _omit, ...rest } = value;
              onChange(rest);
            }
          }}
        />
        <span className={styles.hint}>Leave empty to keep Bottle 1 pending until started.</span>
      </label>

      <label className={styles.field} htmlFor={templateId}>
        <span className={styles.label}>Ownership template</span>
        <select
          id={templateId}
          className={styles.select}
          value={value.templateId ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v) update({ templateId: v });
            else {
              const { templateId: _omit, ...rest } = value;
              onChange(rest);
            }
          }}
        >
          <option value="">None</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Extras</h3>
          <button type="button" className={styles.addButton} onClick={onAddExtra}>
            + Add extra
          </button>
        </div>
        {value.extras.length === 0 ? (
          <p className={styles.empty}>No extras added.</p>
        ) : (
          <div className={styles.extraList}>
            {value.extras.map((extra) => (
              <div key={extra.id} className={styles.extraRow}>
                <button
                  type="button"
                  className={styles.extraButton}
                  onClick={() => onEditExtra(extra)}
                >
                  <span>{extra.label}</span>
                  <span className={styles.extraTime}>{formatTimeForDisplay(extra.startTime)}</span>
                </button>
                <button
                  type="button"
                  className={styles.removeButton}
                  aria-label={`Remove ${extra.label}`}
                  onClick={() => onRemoveExtra(extra.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
