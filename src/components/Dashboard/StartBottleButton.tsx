"use client";

import { useEffect, useState } from "react";
import type { Event } from "@/domain";
import { formatTime, parseTime } from "@/domain";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import styles from "./ActionButton.module.css";

export type StartBottleButtonProps = {
  defaultAmountOz: number;
  dayId: string;
  nextNumber: number;
  onLog: (bottle: Event) => void | Promise<void>;
  /** "HH:MM" of the most recent bottle. Used by the soon-after-last guard. */
  lastBottleTime?: string;
  /** Below this gap, tapping the button shows a confirm dialog. Defaults to 20. */
  minIntervalMinutes?: number;
};

function currentLocalMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

const FEEDBACK_DURATION_MS = 1500;

export function StartBottleButton({
  defaultAmountOz,
  dayId,
  nextNumber,
  onLog,
  lastBottleTime,
  minIntervalMinutes = 20,
}: StartBottleButtonProps) {
  const [logged, setLogged] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Auto-clear the "Logged ✓" state after a beat.
  useEffect(() => {
    if (!logged) return;
    const t = setTimeout(() => setLogged(false), FEEDBACK_DURATION_MS);
    return () => clearTimeout(t);
  }, [logged]);

  const buildBottle = (): Event => {
    const startTime = formatTime(currentLocalMinutes());
    return {
      id: `actual-${dayId}-bottle-${nextNumber}-${Date.now()}`,
      dayId,
      eventKey: `bottle_${nextNumber}`,
      type: "bottle",
      label: `Bottle ${nextNumber}`,
      startTime,
      amountOz: defaultAmountOz,
      source: "actual",
      status: "actual",
    };
  };

  const performLog = async () => {
    if (pending) return;
    setPending(true);
    try {
      await onLog(buildBottle());
      setLogged(true);
    } finally {
      setPending(false);
    }
  };

  const handleClick = () => {
    if (pending) return;
    if (lastBottleTime) {
      const gap = currentLocalMinutes() - parseTime(lastBottleTime);
      if (gap >= 0 && gap < minIntervalMinutes) {
        setConfirmOpen(true);
        return;
      }
    }
    void performLog();
  };

  const label = logged ? "✓ Bottle logged" : "Start Bottle Now";

  // Compute "X min ago" for the dialog body
  const minutesAgo =
    lastBottleTime !== undefined ? currentLocalMinutes() - parseTime(lastBottleTime) : null;

  return (
    <>
      <button
        type="button"
        className={styles.button}
        onClick={handleClick}
        disabled={pending}
        aria-live="polite"
      >
        {label}
      </button>
      <ConfirmDialog
        open={confirmOpen}
        title="Start another bottle now?"
        body={
          minutesAgo !== null
            ? `Last bottle was ${minutesAgo} min ago. Tap Confirm to log a new bottle anyway.`
            : "Tap Confirm to log a new bottle."
        }
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={async () => {
          setConfirmOpen(false);
          await performLog();
        }}
      />
    </>
  );
}
