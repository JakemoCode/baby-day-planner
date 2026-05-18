"use client";

import { newEventId } from "../../lib/newEventId";
import type { OwnersConfig } from "../../schemas";
import styles from "./OwnersConfigEditor.module.css";

export type OwnersConfigEditorProps = {
  value: OwnersConfig;
  onChange: (next: OwnersConfig) => void;
};

export function OwnersConfigEditor({ value, onChange }: OwnersConfigEditorProps) {
  const updateParent = (slot: "parent1" | "parent2", patch: Partial<OwnersConfig["parent1"]>) => {
    onChange({ ...value, [slot]: { ...value[slot], ...patch } });
  };

  const updateOther = (id: string, patch: Partial<OwnersConfig["other"][number]>) => {
    onChange({
      ...value,
      other: value.other.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    });
  };

  const addOther = () => {
    const id = newEventId("other");
    onChange({
      ...value,
      other: [...value.other, { id, displayName: "", color: "#999" }],
    });
  };

  const removeOther = (id: string) => {
    onChange({ ...value, other: value.other.filter((o) => o.id !== id) });
  };

  return (
    <div className={styles.section}>
      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="parent1-name">
            Parent 1 name
          </label>
          <input
            id="parent1-name"
            className={styles.input}
            type="text"
            value={value.parent1.displayName}
            onChange={(e) => updateParent("parent1", { displayName: e.target.value })}
            placeholder="e.g. Jake"
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="parent1-color">
            Parent 1 color
          </label>
          <input
            id="parent1-color"
            className={`${styles.input} ${styles.colorInput}`}
            type="text"
            value={value.parent1.color}
            onChange={(e) => updateParent("parent1", { color: e.target.value })}
            placeholder="#0af"
          />
        </div>
        <div />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="parent2-name">
            Parent 2 name
          </label>
          <input
            id="parent2-name"
            className={styles.input}
            type="text"
            value={value.parent2.displayName}
            onChange={(e) => updateParent("parent2", { displayName: e.target.value })}
            placeholder="e.g. Sam"
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="parent2-color">
            Parent 2 color
          </label>
          <input
            id="parent2-color"
            className={`${styles.input} ${styles.colorInput}`}
            type="text"
            value={value.parent2.color}
            onChange={(e) => updateParent("parent2", { color: e.target.value })}
            placeholder="#f0a"
          />
        </div>
        <div />
      </div>

      {value.other.map((o) => (
        <div key={o.id} className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`other-name-${o.id}`}>
              Other owner name
            </label>
            <input
              id={`other-name-${o.id}`}
              className={styles.input}
              type="text"
              value={o.displayName}
              onChange={(e) => updateOther(o.id, { displayName: e.target.value })}
              placeholder="e.g. Daycare"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`other-color-${o.id}`}>
              Color
            </label>
            <input
              id={`other-color-${o.id}`}
              className={`${styles.input} ${styles.colorInput}`}
              type="text"
              value={o.color}
              onChange={(e) => updateOther(o.id, { color: e.target.value })}
            />
          </div>
          <button
            type="button"
            className={styles.removeButton}
            onClick={() => removeOther(o.id)}
            aria-label={`Remove ${o.displayName || "owner"}`}
          >
            Remove
          </button>
        </div>
      ))}

      <button type="button" className={styles.addButton} onClick={addOther}>
        + Add other owner
      </button>
    </div>
  );
}
