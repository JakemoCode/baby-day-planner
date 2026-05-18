"use client";

import { db } from "@/lib/firebase/client";
import { LoadingState } from "@/components/shared/LoadingState";
import { SettingsAccount } from "@/v3/components/shared/SettingsAccount";
import { OwnersConfigEditor } from "@/v3/components/Settings/OwnersConfigEditor";
import { withV3SettingsDefaults } from "@/v3/firestore/settingsDefaults";
import { useLocalStorageString } from "@/v3/hooks/useLocalStorageString";
import { useV3Settings } from "@/v3/hooks/useV3Settings";
import { saveSettings } from "@/v3/repositories/settings";
import type { BottleIntervalRule, OwnerSlot, Settings, TimeMin } from "@/v3/schemas";
import { formatHM24 } from "@/v3/ui/time";
import styles from "./page.module.css";

const CHILD_ID = process.env.NEXT_PUBLIC_DEFAULT_CHILD_ID ?? "aden";

const ACCORDION_STORAGE_KEY = "bdp.settings.accordion.openSlug";
const DEFAULT_OPEN_SLUG = "default-times";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function parseTime(s: string): TimeMin {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

export default function SettingsPage() {
  const { settings, loading } = useV3Settings(CHILD_ID);
  const [openSlug, setOpenSlug] = useLocalStorageString(ACCORDION_STORAGE_KEY, DEFAULT_OPEN_SLUG);

  function handleToggle(slug: string): void {
    setOpenSlug(openSlug === slug ? "" : slug);
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <LoadingState label="Loading settings" />
      </main>
    );
  }

  // First-run: no doc yet — start with conservative defaults so all editors
  // render. The first save creates the doc; the watcher then keeps things
  // in sync via the defaulter on read.
  const value: Settings = settings ?? withV3SettingsDefaults({ childId: CHILD_ID })!;
  const persist = (next: Settings) => {
    void saveSettings(db, CHILD_ID, next);
  };
  const set = <K extends keyof Settings>(key: K, v: Settings[K]) => persist({ ...value, [key]: v });

  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>Settings</h1>

      <OwnersConfigEditor value={value.owners} onChange={(owners) => set("owners", owners)} />

      <Section title="Default times" isOpen={openSlug === "default-times"} onToggle={handleToggle}>
        <TimeRow
          id="defaultWakeTime"
          label="Default wake time"
          value={value.defaultWakeTime}
          onChange={(v) => set("defaultWakeTime", v)}
        />
        <TimeRow
          id="bedtimeThreshold"
          label="Bedtime threshold"
          value={value.bedtimeThreshold}
          onChange={(v) => set("bedtimeThreshold", v)}
          help="The first projected nap landing at or after this time becomes bedtime."
        />
      </Section>

      <Section title="Naps" isOpen={openSlug === "naps"} onToggle={handleToggle}>
        <NumberRow
          id="defaultNapLengthMinutes"
          label="Default nap length (min)"
          value={value.defaultNapLengthMinutes}
          onChange={(v) => set("defaultNapLengthMinutes", v)}
        />
        <NumberRow
          id="shortNapThresholdMinutes"
          label="Short nap threshold (min)"
          value={value.shortNapThresholdMinutes}
          onChange={(v) => set("shortNapThresholdMinutes", v)}
        />
        <NumberRow
          id="shortNapAdjustmentMinutes"
          label="Short nap adjustment (min)"
          value={value.shortNapAdjustmentMinutes}
          onChange={(v) => set("shortNapAdjustmentMinutes", v)}
        />
        <NumberRow
          id="putdownLeadMinutes"
          label="Putdown lead (min)"
          value={value.putdownLeadMinutes}
          onChange={(v) => set("putdownLeadMinutes", v)}
          help="Wind-down before naps; renders as a virtual block on the timeline."
        />
        <NumberRow
          id="napDurationMin"
          label="Min nap duration (min)"
          value={value.napDurationMin}
          onChange={(v) => set("napDurationMin", v)}
        />
        <NumberRow
          id="napDurationMax"
          label="Max nap duration (min)"
          value={value.napDurationMax}
          onChange={(v) => set("napDurationMax", v)}
        />
      </Section>

      <Section
        title="Wake windows (per nap N)"
        isOpen={openSlug === "wake-windows-per-nap-n"}
        onToggle={handleToggle}
      >
        <WakeWindowsRow
          value={value.wakeWindowsMinutes}
          onChange={(v) => set("wakeWindowsMinutes", v)}
        />
      </Section>

      <Section title="Bottles" isOpen={openSlug === "bottles"} onToggle={handleToggle}>
        <NumberRow
          id="defaultBottleAmountOz"
          label="Default amount (oz)"
          step={0.5}
          value={value.defaultBottleAmountOz}
          onChange={(v) => set("defaultBottleAmountOz", v)}
        />
        <NumberRow
          id="defaultBottleIntervalMinutes"
          label="Default interval (min)"
          value={value.defaultBottleIntervalMinutes}
          onChange={(v) => set("defaultBottleIntervalMinutes", v)}
        />
        <NumberRow
          id="minBottleIntervalMinutes"
          label="Min interval (min)"
          value={value.minBottleIntervalMinutes}
          onChange={(v) => set("minBottleIntervalMinutes", v)}
        />
        <NumberRow
          id="bottlesPerDay"
          label="Expected bottles per day"
          value={value.bottleChain.bottlesPerDay}
          onChange={(v) => set("bottleChain", { ...value.bottleChain, bottlesPerDay: v })}
          help="Lower-bound forecast; baby may feed more often. Drives placeholder projection."
        />
        <NumberRow
          id="bufferAfterWakeMinutes"
          label="Buffer after wake (min)"
          value={value.bottleChain.bufferAfterWakeMinutes}
          onChange={(v) => set("bottleChain", { ...value.bottleChain, bufferAfterWakeMinutes: v })}
          help="Delay before the first projected bottle when none has been recorded yet."
        />
        <BottleIntervalRulesRow
          value={value.bottleIntervalRules}
          onChange={(v) => set("bottleIntervalRules", v)}
        />
      </Section>

      <Section title="Pumps" isOpen={openSlug === "pumps"} onToggle={handleToggle}>
        <PumpTimesRow value={value.pumpTimes} onChange={(v) => set("pumpTimes", v)} />
        <NumberRow
          id="defaultPumpDurationMinutes"
          label="Default pump duration (min)"
          value={value.defaultPumpDurationMinutes}
          onChange={(v) => set("defaultPumpDurationMinutes", v)}
          help="How long a pump session typically takes; pumps render as duration blocks of this length."
        />
        <OwnerSlotRow
          id="pumpOwnerSlot"
          label="Pump owner"
          value={value.pumpOwnerSlot}
          onChange={(v) => set("pumpOwnerSlot", v)}
        />
      </Section>

      <Section title="Dream feed" isOpen={openSlug === "dream-feed"} onToggle={handleToggle}>
        <CheckboxRow
          id="dreamFeedEnabled"
          label="Label first post-bedtime bottle as Dream Feed"
          value={value.dreamFeedEnabled}
          onChange={(v) => set("dreamFeedEnabled", v)}
          help="Render-only label. The bottle cascade is unchanged; the first projected bottle past bedtime is just renamed."
        />
      </Section>

      <Section
        title="Timeline display"
        isOpen={openSlug === "timeline-display"}
        onToggle={handleToggle}
      >
        <ColorModeRow
          id="timelineColorMode"
          label="Color encodes"
          value={value.timelineColorMode}
          onChange={(v) => set("timelineColorMode", v)}
          help="Blocks can color-code by event type or by who owns the slot."
        />
        <NumberRow
          id="timelinePxPerHour"
          label="Pixels per hour"
          value={value.timelinePxPerHour}
          onChange={(v) => set("timelinePxPerHour", v)}
          help="Vertical scale of the daily timeline. Higher = larger blocks. 70–220 recommended."
        />
        <CheckboxRow
          id="timelineDimPast"
          label="Dim past events"
          value={value.timelineDimPast}
          onChange={(v) => set("timelineDimPast", v)}
          help="Renders events that have already passed at reduced opacity."
        />
      </Section>

      <SettingsAccount />
    </main>
  );
}

function Section({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: (slug: string) => void;
  children: React.ReactNode;
}) {
  const slug = slugify(title);
  return (
    <details className={styles.section} open={isOpen}>
      <summary
        className={styles.sectionSummary}
        onClick={(e) => {
          e.preventDefault();
          onToggle(slug);
        }}
      >
        <span className={styles.sectionChevron} aria-hidden="true">
          ▸
        </span>
        <h2 className={styles.sectionTitle}>{title}</h2>
      </summary>
      <div className={styles.sectionBody}>{children}</div>
    </details>
  );
}

function TimeRow({
  id,
  label,
  value,
  onChange,
  help,
}: {
  id: string;
  label: string;
  value: TimeMin;
  onChange: (next: TimeMin) => void;
  help?: string;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </label>
      <input
        id={id}
        type="time"
        value={formatHM24(value)}
        onChange={(e) => onChange(parseTime(e.target.value))}
        className={styles.input}
      />
      {help && <span className={styles.fieldHelp}>{help}</span>}
    </div>
  );
}

function NumberRow({
  id,
  label,
  value,
  onChange,
  step,
  help,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (next: number) => void;
  step?: number;
  help?: string;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        value={value}
        step={step ?? 1}
        min={0}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className={styles.input}
      />
      {help && <span className={styles.fieldHelp}>{help}</span>}
    </div>
  );
}

function WakeWindowsRow({
  value,
  onChange,
}: {
  value: number[];
  onChange: (next: number[]) => void;
}) {
  return (
    <div className={styles.repeater}>
      {value.map((mins, i) => (
        <div key={i} className={styles.repeaterRow}>
          <label htmlFor={`ww-${i}`} className={styles.repeaterLabelWide}>
            {i === 0 ? "After wake-up" : `After nap ${i}`}
          </label>
          <input
            id={`ww-${i}`}
            type="number"
            value={mins}
            min={0}
            onChange={(e) => {
              const next = [...value];
              const n = Number(e.target.value);
              if (Number.isFinite(n)) {
                next[i] = n;
                onChange(next);
              }
            }}
            className={styles.repeaterInputFlex}
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            aria-label={`Remove wake window ${i + 1}`}
            className={styles.iconButton}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, value[value.length - 1] ?? 180])}
        className={styles.addButton}
      >
        + Add wake window
      </button>
    </div>
  );
}

function PumpTimesRow({
  value,
  onChange,
}: {
  value: TimeMin[];
  onChange: (next: TimeMin[]) => void;
}) {
  return (
    <div className={styles.repeater}>
      {value.map((t, i) => (
        <div key={i} className={styles.repeaterRow}>
          <label htmlFor={`pump-${i}`} className={styles.repeaterLabelNarrow}>
            Pump {i + 1}
          </label>
          <input
            id={`pump-${i}`}
            type="time"
            value={formatHM24(t)}
            onChange={(e) => {
              const next = [...value];
              next[i] = parseTime(e.target.value);
              onChange(next);
            }}
            className={styles.repeaterInputFlex}
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            aria-label={`Remove pump ${i + 1}`}
            className={styles.iconButton}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, 12 * 60])}
        className={styles.addButton}
      >
        + Add pump time
      </button>
    </div>
  );
}

function BottleIntervalRulesRow({
  value,
  onChange,
}: {
  value: BottleIntervalRule[];
  onChange: (next: BottleIntervalRule[]) => void;
}) {
  const update = (i: number, patch: Partial<BottleIntervalRule>) => {
    const next = value.map((r, j) => (j === i ? { ...r, ...patch } : r));
    onChange(next);
  };
  return (
    <div className={styles.repeater}>
      <label className={styles.fieldLabel}>Amount → interval rules</label>
      <small className={styles.fieldHelp}>
        After a bottle of N oz, expect the next bottle in M minutes. Most-specific (narrowest) range
        wins on overlap. Falls back to default interval when no rule matches.
      </small>
      {value.map((rule, i) => (
        <div key={i} className={styles.repeaterRowWrap}>
          <input
            type="number"
            step={0.5}
            min={0}
            value={rule.minOz}
            onChange={(e) => update(i, { minOz: Math.max(0, Number(e.target.value)) })}
            aria-label={`Rule ${i + 1} min oz`}
            className={styles.repeaterInputSm}
          />
          <span className={styles.repeaterText}>–</span>
          <input
            type="number"
            step={0.5}
            min={0}
            placeholder="∞"
            value={rule.maxOz ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                onChange(
                  value.map((r, j) =>
                    j === i ? { minOz: rule.minOz, intervalMinutes: rule.intervalMinutes } : r,
                  ),
                );
                return;
              }
              // Clamp maxOz to be ≥ minOz so inverted-range rules (which
              // could never match anything) can't be created via the UI.
              const next = Math.max(rule.minOz, Number(raw));
              onChange(value.map((r, j) => (j === i ? { ...rule, maxOz: next } : r)));
            }}
            aria-label={`Rule ${i + 1} max oz`}
            className={styles.repeaterInputMd}
          />
          <span className={styles.repeaterText}>oz →</span>
          <input
            type="number"
            step={5}
            min={1}
            value={rule.intervalMinutes}
            // Engine math would loop tight or cascade backwards on ≤0.
            onChange={(e) => update(i, { intervalMinutes: Math.max(1, Number(e.target.value)) })}
            aria-label={`Rule ${i + 1} interval minutes`}
            className={styles.repeaterInputMd}
          />
          <span className={styles.repeaterText}>min</span>
          <button
            type="button"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            aria-label={`Remove rule ${i + 1}`}
            className={styles.iconButton}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, { minOz: 0, intervalMinutes: 180 }])}
        className={styles.addButton}
      >
        + Add rule
      </button>
    </div>
  );
}

function ColorModeRow({
  id,
  label,
  value,
  onChange,
  help,
}: {
  id: string;
  label: string;
  value: "type" | "owner";
  onChange: (next: "type" | "owner") => void;
  help?: string;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as "type" | "owner")}
        className={styles.input}
      >
        <option value="type">Event type (recommended)</option>
        <option value="owner">Owner</option>
      </select>
      {help && <small className={styles.fieldHelp}>{help}</small>}
    </div>
  );
}

function CheckboxRow({
  id,
  label,
  value,
  onChange,
  help,
}: {
  id: string;
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
  help?: string;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.checkboxLabel}>
        <input
          id={id}
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          className={styles.checkboxInput}
        />
        {label}
      </label>
      {help && <small className={styles.fieldHelp}>{help}</small>}
    </div>
  );
}

function OwnerSlotRow({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: OwnerSlot;
  onChange: (next: OwnerSlot) => void;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as OwnerSlot)}
        className={styles.input}
      >
        <option value="parent1">Parent 1</option>
        <option value="parent2">Parent 2</option>
      </select>
    </div>
  );
}
