"use client";

import { useId } from "react";
import type { BottleRule, Settings } from "@/domain";
import fieldStyles from "./SettingsField.module.css";
import styles from "./BottleRulesEditor.module.css";

export type BottleSettings = Pick<
  Settings,
  | "defaultBottleAmountOz"
  | "defaultBottleIntervalMinutes"
  | "bottleRules"
  | "minBottleIntervalMinutes"
>;

export type BottleRulesEditorProps = {
  value: BottleSettings;
  onChange: (next: BottleSettings) => void;
};

export function BottleRulesEditor({ value, onChange }: BottleRulesEditorProps) {
  const ids = { amount: useId(), interval: useId(), guard: useId() };

  const replaceRule = (index: number, next: BottleRule) => {
    const list = [...value.bottleRules];
    list[index] = next;
    onChange({ ...value, bottleRules: list });
  };

  const updateNumberField = (index: number, field: "minOz" | "intervalMinutes", raw: string) => {
    const current = value.bottleRules[index];
    if (!current) return;
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    replaceRule(index, { ...current, [field]: n });
  };

  const updateMaxOz = (index: number, raw: string) => {
    const current = value.bottleRules[index];
    if (!current) return;
    if (raw === "") {
      // Clear maxOz — must omit the key under exactOptionalPropertyTypes.
      const { maxOz: _omit, ...rest } = current;
      replaceRule(index, rest);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    replaceRule(index, { ...current, maxOz: n });
  };

  const removeRule = (index: number) => {
    onChange({
      ...value,
      bottleRules: value.bottleRules.filter((_, i) => i !== index),
    });
  };

  const addRule = () => {
    onChange({
      ...value,
      bottleRules: [...value.bottleRules, { minOz: 0, intervalMinutes: 180 }],
    });
  };

  return (
    <section className={fieldStyles.section} aria-labelledby="bottle-rules-h">
      <header className={fieldStyles.sectionHeader}>
        <h3 className={fieldStyles.sectionTitle} id="bottle-rules-h">
          Bottle rules
        </h3>
        <button type="button" className={fieldStyles.button} onClick={addRule}>
          + Add rule
        </button>
      </header>
      <p className={fieldStyles.sectionDescription}>
        Maps bottle amount to interval until the next bottle. Most-specific rule wins when multiple
        match.
      </p>

      <label className={fieldStyles.field} htmlFor={ids.amount}>
        <span className={fieldStyles.label}>Default amount (oz)</span>
        <input
          id={ids.amount}
          type="number"
          step="0.5"
          min="0"
          className={fieldStyles.input}
          value={value.defaultBottleAmountOz}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange({ ...value, defaultBottleAmountOz: n });
          }}
        />
      </label>

      <label className={fieldStyles.field} htmlFor={ids.interval}>
        <span className={fieldStyles.label}>Default interval (minutes)</span>
        <span className={fieldStyles.hint}>Used when amount is unknown or no rule matches.</span>
        <input
          id={ids.interval}
          type="number"
          min="0"
          className={fieldStyles.input}
          value={value.defaultBottleIntervalMinutes}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange({ ...value, defaultBottleIntervalMinutes: n });
          }}
        />
      </label>

      <label className={fieldStyles.field} htmlFor={ids.guard}>
        <span className={fieldStyles.label}>Confirm bottle within (minutes)</span>
        <span className={fieldStyles.hint}>
          Tapping &ldquo;Start Bottle Now&rdquo; sooner than this asks &ldquo;are you sure?&rdquo; —
          protects against accidental double-taps.
        </span>
        <input
          id={ids.guard}
          type="number"
          min="0"
          className={fieldStyles.input}
          value={value.minBottleIntervalMinutes ?? 20}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange({ ...value, minBottleIntervalMinutes: n });
          }}
        />
      </label>

      {value.bottleRules.length === 0 ? (
        <p className={fieldStyles.empty}>No rules — add one or rely on the default interval.</p>
      ) : (
        <div className={fieldStyles.list}>
          {value.bottleRules.map((rule, i) => {
            const minId = `rule-min-${i}`;
            const maxId = `rule-max-${i}`;
            const intId = `rule-int-${i}`;
            return (
              <div key={i} className={styles.ruleRow}>
                <div className={styles.ruleTopRow}>
                  <div className={styles.ruleField}>
                    <label htmlFor={minId} className={styles.smallLabel}>
                      Min oz
                    </label>
                    <input
                      id={minId}
                      type="number"
                      step="0.1"
                      min="0"
                      className={styles.smallInput}
                      value={rule.minOz}
                      onChange={(e) => updateNumberField(i, "minOz", e.target.value)}
                    />
                  </div>
                  <div className={styles.ruleField}>
                    <label htmlFor={maxId} className={styles.smallLabel}>
                      Max oz (blank = open)
                    </label>
                    <input
                      id={maxId}
                      type="number"
                      step="0.1"
                      min="0"
                      className={styles.smallInput}
                      value={rule.maxOz ?? ""}
                      onChange={(e) => updateMaxOz(i, e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className={fieldStyles.dangerButton}
                    aria-label={`Remove rule ${i + 1}`}
                    onClick={() => removeRule(i)}
                  >
                    ×
                  </button>
                </div>
                <div className={styles.ruleField}>
                  <label htmlFor={intId} className={styles.smallLabel}>
                    Interval (minutes)
                  </label>
                  <input
                    id={intId}
                    type="number"
                    min="0"
                    className={styles.smallInput}
                    value={rule.intervalMinutes}
                    onChange={(e) => updateNumberField(i, "intervalMinutes", e.target.value)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
