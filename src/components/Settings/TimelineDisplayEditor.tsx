"use client";

import { useId } from "react";
import { TIMELINE_DEFAULTS } from "@/domain";
import styles from "./SettingsField.module.css";

export type TimelineDisplay = {
  /** Default 'type' — block fill encodes event type. 'owner' encodes owner. */
  colorMode: "type" | "owner";
  /** 70-220 px/hour. Default 120 (= 2 px/min). */
  pxPerHour: number;
  /** Default true — past events render at 0.45 opacity on the live timeline. */
  dimPast: boolean;
};

export type TimelineDisplayEditorProps = {
  value: TimelineDisplay;
  onChange: (next: TimelineDisplay) => void;
};

/**
 * Three knobs for Timeline v2 layout (TIMELINE_V2_PLAN.md §8). The values
 * are stored on Settings as optional fields; the editor reads via the caller
 * which falls back to TIMELINE_DEFAULTS when a Settings doc predates v2.
 */
export function TimelineDisplayEditor({ value, onChange }: TimelineDisplayEditorProps) {
  const ids = { mode: useId(), height: useId(), dim: useId() };

  return (
    <section className={styles.section} aria-labelledby={`${ids.mode}-h`}>
      <header className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle} id={`${ids.mode}-h`}>
          Timeline display
        </h3>
      </header>
      <p className={styles.sectionDescription}>
        How blocks and chips are drawn on the daily timeline.
      </p>

      <fieldset className={styles.field}>
        <legend className={styles.label}>Color encodes</legend>
        <span className={styles.hint}>
          Blocks can color-code by event type or by who owns the slot.
        </span>
        <label className={styles.row} htmlFor={`${ids.mode}-type`}>
          <input
            id={`${ids.mode}-type`}
            type="radio"
            name="timelineColorMode"
            checked={value.colorMode === "type"}
            onChange={() => onChange({ ...value, colorMode: "type" })}
          />
          <span className={styles.label}>Event type (recommended)</span>
        </label>
        <label className={styles.row} htmlFor={`${ids.mode}-owner`}>
          <input
            id={`${ids.mode}-owner`}
            type="radio"
            name="timelineColorMode"
            checked={value.colorMode === "owner"}
            onChange={() => onChange({ ...value, colorMode: "owner" })}
          />
          <span className={styles.label}>Owner</span>
        </label>
      </fieldset>

      <label className={styles.field} htmlFor={ids.height}>
        <span className={styles.label}>Hour height ({value.pxPerHour} px)</span>
        <span className={styles.hint}>
          How tall an hour is on screen. Lower = more day visible at a glance; higher = more
          breathing room.
        </span>
        <input
          id={ids.height}
          type="range"
          min={70}
          max={220}
          step={10}
          className={styles.input}
          value={value.pxPerHour}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange({ ...value, pxPerHour: n });
          }}
        />
      </label>

      <label className={styles.row} htmlFor={ids.dim}>
        <input
          id={ids.dim}
          type="checkbox"
          className={styles.checkbox}
          checked={value.dimPast}
          onChange={(e) => onChange({ ...value, dimPast: e.target.checked })}
        />
        <span className={styles.label}>Dim past events</span>
      </label>
      <span className={styles.hint}>
        Events earlier than the current time render slightly faded. Defaults to{" "}
        {TIMELINE_DEFAULTS.dimPast ? "on" : "off"}.
      </span>
    </section>
  );
}
