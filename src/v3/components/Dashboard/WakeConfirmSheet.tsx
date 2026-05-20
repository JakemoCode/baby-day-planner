"use client";

import { useState } from "react";
import type { TimeMin } from "@/v3/schemas";
import { formatHM24, parseHM24 } from "@/v3/ui/time";
import { BottomSheet } from "@/components/shared/BottomSheet";
import styles from "./WakeConfirmSheet.module.css";

export type WakeConfirmSheetProps = {
  /** Pre-fills the time input. The caller is responsible for mounting
   * this component only when the sheet should be visible — that way a
   * fresh `nowMinutes` is captured on each open. */
  nowMinutes: TimeMin;
  onConfirm: (wakeTime: TimeMin) => void;
  onCancel: () => void;
};

export function WakeConfirmSheet({ nowMinutes, onConfirm, onCancel }: WakeConfirmSheetProps) {
  const [value, setValue] = useState(formatHM24(nowMinutes));
  const parsed = parseHM24(value);

  return (
    <BottomSheet open title="What time did they wake up?" onCancel={onCancel}>
      <label className={styles.field}>
        <span className={styles.label}>Wake time</span>
        <input
          type="time"
          className={styles.input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
      </label>
      <button
        type="button"
        className={styles.confirm}
        onClick={() => {
          if (parsed !== undefined) onConfirm(parsed);
        }}
        disabled={parsed === undefined}
      >
        Start day
      </button>
    </BottomSheet>
  );
}
