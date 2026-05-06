"use client";

import { useEffect, useState } from "react";
import type { Event } from "@/domain";
import { formatTime } from "@/domain";
import styles from "./ActionButton.module.css";

export type StartBottleButtonProps = {
  defaultAmountOz: number;
  dayId: string;
  nextNumber: number;
  onLog: (bottle: Event) => void | Promise<void>;
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
}: StartBottleButtonProps) {
  const [logged, setLogged] = useState(false);
  const [pending, setPending] = useState(false);

  // Auto-clear the "Logged ✓" state after a beat.
  useEffect(() => {
    if (!logged) return;
    const t = setTimeout(() => setLogged(false), FEEDBACK_DURATION_MS);
    return () => clearTimeout(t);
  }, [logged]);

  const handleClick = async () => {
    if (pending) return;
    setPending(true);
    const startTime = formatTime(currentLocalMinutes());
    const bottle: Event = {
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
    try {
      await onLog(bottle);
      setLogged(true);
    } finally {
      setPending(false);
    }
  };

  const label = logged ? "✓ Bottle logged" : "Start Bottle Now";

  return (
    <button
      type="button"
      className={styles.button}
      onClick={handleClick}
      disabled={pending}
      aria-live="polite"
    >
      {label}
    </button>
  );
}
