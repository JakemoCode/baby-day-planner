"use client";

import { useRef, useState } from "react";
import type { TimeMin } from "@/v3/schemas";
import { formatHM24, formatTimeForDisplay, parseHM24 } from "@/v3/ui/time";
import styles from "./EditableWakeTime.module.css";

export type EditableWakeTimeProps = {
  wakeTime: TimeMin;
  /** Called when the user commits a new wake time. */
  onChange: (next: TimeMin) => void;
  /**
   * Visual treatment. `"plain"` (default) is a borderless inline button —
   * used on the dashboard where the surrounding cards already provide
   * visual scaffolding. `"card"` wraps the display in a sage-accented
   * card matching the welcome / settings patterns — better for surfaces
   * (e.g. /timeline) where no other card is nearby to anchor the eye.
   */
  variant?: "plain" | "card";
};

/** Inline wake-time back-edit affordance; tapping opens a time input with Save/Cancel. */
export function EditableWakeTime({ wakeTime, onChange, variant = "plain" }: EditableWakeTimeProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleStartEdit() {
    // Snapshot at edit-open; no useEffect sync (would clobber in-flight input or violate React 19 derive rule).
    setDraft(formatHM24(wakeTime));
    setEditing(true);
    // Focus + open the time picker on next tick.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function handleSave() {
    const parsed = parseHM24(draft);
    if (parsed === undefined) {
      setEditing(false);
      return;
    }
    if (parsed !== wakeTime) onChange(parsed);
    setEditing(false);
  }

  function handleCancel() {
    setDraft(formatHM24(wakeTime));
    setEditing(false);
  }

  if (!editing) {
    const displayClass =
      variant === "card" ? `${styles.display} ${styles.displayCard}` : styles.display;
    return (
      <button
        type="button"
        className={displayClass}
        onClick={handleStartEdit}
        aria-label={`Change today's start time (currently ${formatTimeForDisplay(wakeTime)})`}
      >
        <span className={styles.label}>Woke at</span>
        <span className={styles.value}>{formatTimeForDisplay(wakeTime)}</span>
        <span className={styles.editIcon} aria-hidden="true">
          ✎
        </span>
      </button>
    );
  }

  return (
    <div className={styles.editor} role="group" aria-label="Change today's start time">
      <label className={styles.editorLabel}>
        <span className={styles.label}>Woke at</span>
        <input
          ref={inputRef}
          type="time"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") handleCancel();
          }}
          className={styles.input}
        />
      </label>
      <div className={styles.actions}>
        <button type="button" onClick={handleCancel} className={styles.secondaryBtn}>
          Cancel
        </button>
        <button type="button" onClick={handleSave} className={styles.primaryBtn}>
          Save
        </button>
      </div>
    </div>
  );
}
