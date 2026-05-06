"use client";

import type { Event } from "@/domain";
import { formatTime } from "@/domain";
import styles from "./ActionButton.module.css";

export type NapActionButtonProps = {
  inProgressNap: Event | undefined;
  dayId: string;
  nextNumber: number;
  onStart: (nap: Event) => void | Promise<void>;
  onEnd: (nap: Event, endTime: string) => void | Promise<void>;
};

function currentLocalMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export function NapActionButton({
  inProgressNap,
  dayId,
  nextNumber,
  onStart,
  onEnd,
}: NapActionButtonProps) {
  const handleClick = () => {
    const time = formatTime(currentLocalMinutes());
    if (inProgressNap) {
      void onEnd(inProgressNap, time);
    } else {
      const nap: Event = {
        id: `actual-${dayId}-nap-${nextNumber}-${Date.now()}`,
        dayId,
        eventKey: `nap_${nextNumber}`,
        type: "nap",
        label: `Nap ${nextNumber}`,
        startTime: time,
        source: "actual",
        status: "actual",
      };
      void onStart(nap);
    }
  };

  return (
    <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={handleClick}>
      {inProgressNap ? "End Nap" : "Start Nap Now"}
    </button>
  );
}
