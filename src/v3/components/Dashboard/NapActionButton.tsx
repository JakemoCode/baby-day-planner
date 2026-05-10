"use client";

import type { Event, TimeMin } from "@/v3/schemas";
import { newEventId } from "@/v3/lib/newEventId";
import styles from "./ActionButton.module.css";

export type NapActionButtonProps = {
  inProgressNap: Event | undefined;
  dayId: string;
  nextNumber: number;
  onStart: (nap: Event) => Promise<void>;
  onEnd: (nap: Event, endTime: TimeMin) => Promise<void>;
};

function currentLocalMinutes(): TimeMin {
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
    const nowMin = currentLocalMinutes();
    if (inProgressNap) {
      void onEnd(inProgressNap, nowMin);
      return;
    }
    const nap: Event = {
      id: newEventId("nap"),
      dayId,
      eventKey: `nap_${nextNumber}`,
      type: "nap",
      kind: "block",
      label: `Nap ${nextNumber}`,
      startTime: nowMin,
      hasPutdown: false,
      lifecycle: { state: "started", committedAt: nowMin },
    };
    void onStart(nap);
  };

  return (
    <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={handleClick}>
      {inProgressNap ? "End Nap" : "Start Nap Now"}
    </button>
  );
}
