"use client";

import type { Event, TimeMin } from "@/v3/schemas";
import { newEventId } from "@/v3/lib/newEventId";
import { currentLocalMinutes } from "@/v3/ui/time";
import { ActionButton } from "./ActionButton";

export type NapActionButtonProps = {
  inProgressNap: Event | undefined;
  dayId: string;
  nextNumber: number;
  /**
   * The next-upcoming projected nap, if any. When provided, Start Nap
   * **promotes** that projection (uses its eventKey + label) instead of
   * inventing a new slot. Prevents the §F24 duplicate where a fresh
   * `nap_${nextNumber}` doc landed next to its still-projected sibling.
   * Falls back to `nap_${nextNumber}` when no projection exists.
   */
  nextProjectedNap?: Event;
  onStart: (nap: Event) => Promise<void>;
  onEnd: (nap: Event, endTime: TimeMin) => Promise<void>;
};

export function NapActionButton({
  inProgressNap,
  dayId,
  nextNumber,
  nextProjectedNap,
  onStart,
  onEnd,
}: NapActionButtonProps) {
  const handleClick = () => {
    const nowMin = currentLocalMinutes();
    if (inProgressNap) {
      void onEnd(inProgressNap, nowMin);
      return;
    }
    // Promote the nearest projection if one exists — its eventKey
    // (`nap_N`) is what the cascade keys off, so consolidation happens
    // automatically. Otherwise fall back to the next computed slot.
    const eventKey = nextProjectedNap?.eventKey ?? `nap_${nextNumber}`;
    const label = nextProjectedNap?.label ?? `Nap ${nextNumber}`;
    const nap: Event = {
      id: newEventId("nap"),
      dayId,
      eventKey,
      type: "nap",
      kind: "block",
      label,
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
