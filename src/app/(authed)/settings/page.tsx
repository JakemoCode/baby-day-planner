"use client";

import { db } from "@/lib/firebase/client";
import { LoadingState } from "@/components/shared/LoadingState";
import { SettingsAccount } from "@/v3/components/shared/SettingsAccount";
import { OwnersConfigEditor } from "@/v3/components/Settings/OwnersConfigEditor";
import { withV3SettingsDefaults } from "@/v3/firestore/settingsDefaults";
import { useV3Settings } from "@/v3/hooks/useV3Settings";
import { saveSettings } from "@/v3/repositories/settings";
import type { OwnerSlot, Settings, TimeMin } from "@/v3/schemas";
import { formatHM24 } from "@/v3/ui/time";
import styles from "./page.module.css";

const CHILD_ID = process.env.NEXT_PUBLIC_DEFAULT_CHILD_ID ?? "aden";

function parseTime(s: string): TimeMin {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

export default function SettingsPage() {
  const { settings, loading } = useV3Settings(CHILD_ID);

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

      <Section title="Default times">
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

      <Section title="Naps">
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

      <Section title="Wake windows (per nap N)">
        <WakeWindowsRow
          value={value.wakeWindowsMinutes}
          onChange={(v) => set("wakeWindowsMinutes", v)}
        />
      </Section>

      <Section title="Bottles">
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
      </Section>

      <Section title="Pumps">
        <PumpTimesRow value={value.pumpTimes} onChange={(v) => set("pumpTimes", v)} />
        <OwnerSlotRow
          id="pumpOwnerSlot"
          label="Pump owner"
          value={value.pumpOwnerSlot}
          onChange={(v) => set("pumpOwnerSlot", v)}
        />
      </Section>

      <SettingsAccount />
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section ?? ""}>
      <h2 style={{ margin: "0 0 8px 0", fontSize: 18 }}>{title}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </section>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label htmlFor={id} style={{ fontSize: 14 }}>
        {label}
      </label>
      <input
        id={id}
        type="time"
        value={formatHM24(value)}
        onChange={(e) => onChange(parseTime(e.target.value))}
        style={{ padding: 8, fontSize: 16, minHeight: 40 }}
      />
      {help && <span style={{ fontSize: 12, color: "#666" }}>{help}</span>}
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
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label htmlFor={id} style={{ fontSize: 14 }}>
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
        style={{ padding: 8, fontSize: 16, minHeight: 40 }}
      />
      {help && <span style={{ fontSize: 12, color: "#666" }}>{help}</span>}
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
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {value.map((mins, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label htmlFor={`ww-${i}`} style={{ fontSize: 14, minWidth: 70 }}>
            After nap {i + 1}
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
            style={{ padding: 8, fontSize: 16, minHeight: 40, flex: 1 }}
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            aria-label={`Remove wake window ${i + 1}`}
            style={{ padding: "8px 12px", minHeight: 40 }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, value[value.length - 1] ?? 180])}
        style={{ padding: "8px 12px", minHeight: 40, alignSelf: "flex-start" }}
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
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {value.map((t, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label htmlFor={`pump-${i}`} style={{ fontSize: 14, minWidth: 70 }}>
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
            style={{ padding: 8, fontSize: 16, minHeight: 40, flex: 1 }}
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            aria-label={`Remove pump ${i + 1}`}
            style={{ padding: "8px 12px", minHeight: 40 }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, 12 * 60])}
        style={{ padding: "8px 12px", minHeight: 40, alignSelf: "flex-start" }}
      >
        + Add pump time
      </button>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label htmlFor={id} style={{ fontSize: 14 }}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as OwnerSlot)}
        style={{ padding: 8, fontSize: 16, minHeight: 40 }}
      >
        <option value="parent1">Parent 1</option>
        <option value="parent2">Parent 2</option>
      </select>
    </div>
  );
}
