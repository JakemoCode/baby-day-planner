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
   * Falls back to `nap_${nextNumber}` (or a UUID for off-pattern naps,
   * see `maxSlot`) when no projection exists.
   */
  nextProjectedNap?: Event;
  /**
   * Cascade slot count (= settings.wakeWindowsMinutes.length). When
   * the fallback `nextNumber` would exceed this — i.e. the user is
   * starting a nap past the configured slot count — the new doc gets
   * a UUID-based eventKey so it doesn't masquerade as a cascade slot
   * and eat bedtime substitution.
   */
  maxSlot: number;
  onStart: (nap: Event) => Promise<void>;
  onEnd: (nap: Event, endTime: TimeMin) => Promise<void>;
};

export function NapActionButton({
  inProgressNap,
  dayId,
  nextNumber,
  nextProjectedNap,
  maxSlot,
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
    // automatically. Otherwise fall back to the next computed slot,
    // unless that slot would exceed the cascade's configured slot count
    // (off-pattern nap → UUID eventKey).
    const napId = newEventId("nap");
    const fitsSlot = nextNumber <= maxSlot;
    const eventKey = nextProjectedNap?.eventKey ?? (fitsSlot ? `nap_${nextNumber}` : napId);
    const label = nextProjectedNap?.label ?? (fitsSlot ? `Nap ${nextNumber}` : "Nap");
    const nap: Event = {
      id: napId,
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
