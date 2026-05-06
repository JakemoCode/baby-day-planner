"use client";

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
  // Called from a click handler — Date.now() is fine here (handlers aren't render).
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export function StartBottleButton({
  defaultAmountOz,
  dayId,
  nextNumber,
  onLog,
}: StartBottleButtonProps) {
  const handleClick = () => {
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
    void onLog(bottle);
  };

  return (
    <button type="button" className={styles.button} onClick={handleClick}>
      Start Bottle Now
    </button>
  );
}
