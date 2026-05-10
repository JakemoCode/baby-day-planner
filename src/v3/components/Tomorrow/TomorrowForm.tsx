/**
 * V3 TomorrowForm — captures wakeTime (TimeMin) + optional templateId
 * for the Tomorrow plan. The HH:MM string in the time input is parsed
 * and emitted as a TimeMin so consumers stay on V3 types end-to-end.
 *
 * The form is pure: parent owns state, this component is value/onChange.
 */

"use client";

import { useId } from "react";
import type { OwnershipTemplate, TimeMin } from "../../schemas";
import { formatHM24 } from "../../ui/time";
import styles from "./TomorrowForm.module.css";

/**
 * Parse an HH:MM string from a `<input type="time">` into a TimeMin.
 * Returns `null` if the string is malformed (the input is cleared, or
 * a manual edit produced nonsense). The user instruction calls for a
 * shared `parseHM24` in `@/v3/ui/time`, but it doesn't exist there yet
 * and PR-A5's scope is component-only — keep the helper local until
 * the larger time-helper PR lands.
 */
function parseHM24(raw: string): TimeMin | null {
  const m = /^(\d{2}):(\d{2})$/.exec(raw);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export type TomorrowFormValue = {
  wakeTime: TimeMin;
  templateId?: string;
};

export type TomorrowFormProps = {
  value: TomorrowFormValue;
  templates: OwnershipTemplate[];
  onChange: (next: TomorrowFormValue) => void;
};

export function TomorrowForm({ value, templates, onChange }: TomorrowFormProps) {
  const wakeId = useId();
  const templateSelectId = useId();

  const handleWakeChange = (raw: string) => {
    const next = parseHM24(raw);
    if (next === null) return;
    onChange({ ...value, wakeTime: next });
  };

  const handleTemplateChange = (raw: string) => {
    if (raw) {
      onChange({ ...value, templateId: raw });
    } else {
      const { templateId: _omit, ...rest } = value;
      onChange(rest);
    }
  };

  return (
    <div className={styles.form}>
      <label className={styles.field} htmlFor={wakeId}>
        <span className={styles.label}>Wake time</span>
        <input
          id={wakeId}
          type="time"
          className={styles.input}
          value={formatHM24(value.wakeTime)}
          onChange={(e) => handleWakeChange(e.target.value)}
          required
        />
      </label>

      {templates.length > 0 && (
        <label className={styles.field} htmlFor={templateSelectId}>
          <span className={styles.label}>Ownership template</span>
          <select
            id={templateSelectId}
            className={styles.select}
            value={value.templateId ?? ""}
            onChange={(e) => handleTemplateChange(e.target.value)}
          >
            <option value="">None</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.displayName}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
