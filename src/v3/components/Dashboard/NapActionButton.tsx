"use client";

import type { Event, TimeMin } from "@/v3/schemas";
import { currentLocalMinutes, nextDayAt } from "@/v3/ui/time";
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
  /** Settings.defaultNapLengthMinutes — used to set the placeholder endTime. */
  defaultNapLengthMinutes: number;
  /** Settings.defaultWakeTime — used to set bedtime's endTime. */
  defaultWakeTime: TimeMin;
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
  defaultNapLengthMinutes,
  defaultWakeTime,
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
      const bedtime: Event = {
        id: "bedtime",
        dayId,
        eventKey: "bedtime",
        type: "bedtime",
        kind: "block",
        label: "Bedtime",
        startTime: nowMin,
        endTime: nextDayAt(defaultWakeTime),
        hasPutdown: false,
        lifecycle: { state: "recorded", annotatedAt: nowMin },
      };
      void onStartBedtime(bedtime);
      return;
    }

    // Standard path: promote nextProjectedNap. Under the physiology
    // cascade nextProjectedNap is always defined within-day; if a
    // caller invokes this without one (e.g. settings misconfigured),
    // bail safely rather than minting a UUID nap.
    if (!nextProjectedNap) return;
    const nap: Event = {
      id: nextProjectedNap.eventKey,
      dayId,
      eventKey: nextProjectedNap.eventKey,
      type: "nap",
      kind: "block",
      label: nextProjectedNap.label,
      startTime: nowMin,
      endTime: nowMin + defaultNapLengthMinutes,
      hasPutdown: false,
      lifecycle: { state: "recorded", annotatedAt: nowMin },
    };
    void onStart(nap);
  };

  let label: string;
  if (inProgressNap) {
    label = "End Nap";
  } else if (pastThreshold) {
    label = "Start Bedtime Now";
  } else {
    label = "Start Nap Now";
  }

  return (
    <ActionButton variant="secondary" onClick={handleClick}>
      {label}
    </ActionButton>
  );
}
