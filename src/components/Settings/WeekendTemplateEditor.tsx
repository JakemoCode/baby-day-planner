"use client";

import type { Owner, OwnershipTemplate } from "@/domain";
import { copyToOtherDay, flipTemplate } from "@/domain";
import fieldStyles from "./SettingsField.module.css";
import styles from "./WeekendTemplateEditor.module.css";

export type WeekendTemplateEditorProps = {
  saturday: OwnershipTemplate;
  sunday: OwnershipTemplate;
  /** Number of nap/wake-window pairs (typically settings.wakeWindowsMinutes.length). */
  slotCount: number;
  onChange: (saturday: OwnershipTemplate, sunday: OwnershipTemplate) => void;
};

const OWNERS: Owner[] = ["Jake", "Kelly", "Daycare"];

function ensureLength(arr: Owner[], length: number, fallback: Owner): Owner[] {
  if (arr.length === length) return arr;
  return Array.from({ length }, (_, i) => arr[i] ?? fallback);
}

function DaySection({
  label,
  template,
  slotCount,
  onChange,
  onFlip,
  onCopyTo,
  copyToLabel,
}: {
  label: string;
  template: OwnershipTemplate;
  slotCount: number;
  onChange: (next: OwnershipTemplate) => void;
  onFlip: () => void;
  onCopyTo: () => void;
  copyToLabel: string;
}) {
  // Pad arrays so the editor renders all slots even if data is short
  const napOwners = ensureLength(template.napOwners, slotCount, "Jake");
  const wwOwners = ensureLength(template.wakeWindowOwners, slotCount, "Kelly");

  const setNap = (i: number, owner: Owner) => {
    const next = [...napOwners];
    next[i] = owner;
    onChange({ ...template, napOwners: next });
  };

  const setWw = (i: number, owner: Owner) => {
    const next = [...wwOwners];
    next[i] = owner;
    onChange({ ...template, wakeWindowOwners: next });
  };

  return (
    <div className={styles.day}>
      <header className={styles.dayHeader}>
        <h4 className={styles.dayTitle}>{label}</h4>
        <div className={styles.dayActions}>
          <button type="button" className={fieldStyles.button} onClick={onFlip}>
            Flip {label}
          </button>
          <button type="button" className={fieldStyles.button} onClick={onCopyTo}>
            {copyToLabel}
          </button>
        </div>
      </header>
      {Array.from({ length: slotCount }).map((_, i) => {
        const napId = `${template.id}-nap-${i}`;
        const wwId = `${template.id}-ww-${i}`;
        return (
          <div key={i} className={styles.slotRow}>
            <div className={styles.slotField}>
              <label htmlFor={napId} className={styles.slotLabel}>
                {label} Nap {i + 1} owner
              </label>
              <select
                id={napId}
                className={styles.slotSelect}
                value={napOwners[i] ?? "Jake"}
                onChange={(e) => setNap(i, e.target.value as Owner)}
              >
                {OWNERS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.slotField}>
              <label htmlFor={wwId} className={styles.slotLabel}>
                {label} Wake Window {i + 1} owner
              </label>
              <select
                id={wwId}
                className={styles.slotSelect}
                value={wwOwners[i] ?? "Kelly"}
                onChange={(e) => setWw(i, e.target.value as Owner)}
              >
                {OWNERS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function WeekendTemplateEditor({
  saturday,
  sunday,
  slotCount,
  onChange,
}: WeekendTemplateEditorProps) {
  const updateSaturday = (next: OwnershipTemplate) => onChange(next, sunday);
  const updateSunday = (next: OwnershipTemplate) => onChange(saturday, next);
  const flipSat = () => onChange(flipTemplate(saturday), sunday);
  const flipSun = () => onChange(saturday, flipTemplate(sunday));
  const copySatToSun = () => onChange(saturday, copyToOtherDay(saturday, sunday.id, sunday.label));
  const copySunToSat = () => onChange(copyToOtherDay(sunday, saturday.id, saturday.label), sunday);

  return (
    <section className={fieldStyles.section} aria-labelledby="weekend-templates-h">
      <header className={fieldStyles.sectionHeader}>
        <h3 className={fieldStyles.sectionTitle} id="weekend-templates-h">
          Weekend templates
        </h3>
      </header>
      <p className={fieldStyles.sectionDescription}>
        Per-slot ownership for Saturday and Sunday. Flip swaps Jake ↔ Kelly. Copy produces a flipped
        clone in the other day.
      </p>

      <DaySection
        label="Saturday"
        template={saturday}
        slotCount={slotCount}
        onChange={updateSaturday}
        onFlip={flipSat}
        onCopyTo={copySatToSun}
        copyToLabel="Copy Saturday to Sunday"
      />
      <DaySection
        label="Sunday"
        template={sunday}
        slotCount={slotCount}
        onChange={updateSunday}
        onFlip={flipSun}
        onCopyTo={copySunToSat}
        copyToLabel="Copy Sunday to Saturday"
      />
    </section>
  );
}
