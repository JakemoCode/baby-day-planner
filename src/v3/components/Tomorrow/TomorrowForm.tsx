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
import { formatHM24, parseHM24 } from "../../ui/time";
import styles from "./TomorrowForm.module.css";

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
    if (next === undefined) return;
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
