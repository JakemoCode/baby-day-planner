"use client";

import type { Event, TimeMin } from "@/v3/schemas";
import { newEventId } from "@/v3/lib/newEventId";
import { currentLocalMinutes } from "@/v3/ui/time";
import { ActionButton } from "./ActionButton";

export type NapActionButtonProps = {
  inProgressNap: Event | undefined;
  dayId: string;
  nextNumber: number;
  onStart: (nap: Event) => Promise<void>;
  onEnd: (nap: Event, endTime: TimeMin) => Promise<void>;
};

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
    <ActionButton variant="secondary" onClick={handleClick}>
      {inProgressNap ? "End Nap" : "Start Nap Now"}
    </ActionButton>
  );
}
