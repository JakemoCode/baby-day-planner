"use client";

import type { Event } from "@/domain";
import { formatTime, makeEvent, parseTime } from "@/domain";
import styles from "./ActionButton.module.css";

const SHORT_NAP_CONFIRM_MINUTES = 5;

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
      // Guard: if the user is ending a nap less than 5 minutes after
      // starting it, that's almost certainly an accidental double-tap.
      // Confirm before recording — a 0-min nap is invisible on the
      // timeline (well, clamped to 24px now, but the data is still wrong)
      // and the user would have to manually edit the duration to fix.
      const startMin = parseTime(inProgressNap.startTime);
      const endMin = currentLocalMinutes();
      const elapsed = endMin - startMin;
      if (elapsed >= 0 && elapsed < SHORT_NAP_CONFIRM_MINUTES) {
        const ok = window.confirm(
          `That's only ${elapsed} minute${elapsed === 1 ? "" : "s"} since you started this nap. End it anyway?`,
        );
        if (!ok) return;
      }
      void onEnd(inProgressNap, time);
    } else {
      const nap: Event = makeEvent({
        id: `actual-${dayId}-nap-${nextNumber}-${Date.now()}`,
        dayId,
        eventKey: `nap_${nextNumber}`,
        type: "nap",
        label: `Nap ${nextNumber}`,
        startTime: time,
        source: "actual",
        status: "actual",
      });
      void onStart(nap);
    }
  };

  // When a nap is in progress, the button "ends" it — label with that
  // nap's actual ordinal (parsed from its eventKey, e.g. nap_2 → 2).
  const inProgressN = inProgressNap
    ? Number(/^nap_(\d+)/.exec(inProgressNap.eventKey)?.[1] ?? nextNumber - 1)
    : null;

  return (
    <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={handleClick}>
      {inProgressNap ? `End Nap ${inProgressN}` : `Start Nap ${nextNumber}`}
    </button>
  );
}
