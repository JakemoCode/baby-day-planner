"use client";

import type { Event, TimeMin } from "@/v3/schemas";
import { newEventId } from "@/v3/lib/newEventId";
import { currentLocalMinutes } from "@/v3/ui/time";
import { ActionButton } from "./ActionButton";

export type NapActionButtonProps = {
  inProgressNap: Event | undefined;
  dayId: string;
  /**
   * The next-upcoming projected nap, if any. Start Nap promotes that
   * projection (uses its eventKey + label) so the cascade keys off
   * the same `nap_N` slot. Under the physiology cascade this is
   * always defined within-day — past threshold the CTA swaps to
   * Start Bedtime Now instead, so no UUID fallback is needed.
   */
  nextProjectedNap?: Event | undefined;
  /** Current wall-clock TimeMin (used for the CTA swap decision). */
  nowMinutes: TimeMin;
  /** Settings.bedtimeThreshold — drives the CTA swap. */
  bedtimeThreshold: TimeMin;
  onStart: (nap: Event) => Promise<void>;
  onEnd: (nap: Event, endTime: TimeMin) => Promise<void>;
  onStartBedtime: (bedtime: Event) => Promise<void>;
};

export function NapActionButton({
  inProgressNap,
  dayId,
  nextProjectedNap,
  nowMinutes,
  bedtimeThreshold,
  onStart,
  onEnd,
  onStartBedtime,
}: NapActionButtonProps) {
  const pastThreshold = nowMinutes >= bedtimeThreshold;

  const handleClick = () => {
    const nowMin = currentLocalMinutes();
    if (inProgressNap) {
      void onEnd(inProgressNap, nowMin);
      return;
    }

    // Past threshold → start bedtime instead. The dashboard primary
    // CTA stays always-actionable; physiology takes over from rhythm
    // once it's bedtime o'clock (DOMAIN.md §3).
    if (pastThreshold) {
      const bedtimeId = newEventId("bedtime");
      const bedtime: Event = {
        id: bedtimeId,
        dayId,
        eventKey: "bedtime",
        type: "bedtime",
        kind: "block",
        label: "Bedtime",
        startTime: nowMin,
        hasPutdown: false,
        lifecycle: { state: "started", committedAt: nowMin },
      };
      void onStartBedtime(bedtime);
      return;
    }

    // Standard path: promote nextProjectedNap. Under the physiology
    // cascade nextProjectedNap is always defined within-day; if a
    // caller invokes this without one (e.g. settings misconfigured),
    // bail safely rather than minting a UUID nap.
    if (!nextProjectedNap) return;
    const napId = newEventId("nap");
    const nap: Event = {
      id: napId,
      dayId,
      eventKey: nextProjectedNap.eventKey,
      type: "nap",
      kind: "block",
      label: nextProjectedNap.label,
      startTime: nowMin,
      hasPutdown: false,
      lifecycle: { state: "started", committedAt: nowMin },
    };
    void onStart(nap);
  };

  const label = inProgressNap ? "End Nap" : pastThreshold ? "Start Bedtime Now" : "Start Nap Now";

  return (
    <ActionButton variant="secondary" onClick={handleClick}>
      {label}
    </ActionButton>
  );
}
