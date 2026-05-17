"use client";

import type { Event, TimeMin } from "@/v3/schemas";
import { currentLocalMinutes, nextDayAt } from "@/v3/ui/time";
import { ActionButton } from "./ActionButton";

export type NapActionButtonProps = {
  inProgressNap: Event | undefined;
  /** A recorded bedtime that is currently in progress (started but not yet ended). */
  inProgressBedtime?: Event | undefined;
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
  onEndBedtime: (bedtime: Event, endTime: TimeMin) => Promise<void>;
};

type ButtonMode =
  | { kind: "end-nap"; nap: Event }
  | { kind: "end-bedtime"; bedtime: Event }
  | { kind: "start-bedtime" }
  | { kind: "start-nap"; projected: Event }
  | { kind: "disabled" };

function decideMode(
  inProgressNap: Event | undefined,
  inProgressBedtime: Event | undefined,
  pastThreshold: boolean,
  nextProjectedNap: Event | undefined,
): ButtonMode {
  if (inProgressNap) return { kind: "end-nap", nap: inProgressNap };
  if (inProgressBedtime) return { kind: "end-bedtime", bedtime: inProgressBedtime };
  if (pastThreshold) return { kind: "start-bedtime" };
  if (nextProjectedNap) return { kind: "start-nap", projected: nextProjectedNap };
  // No in-progress sleep, no upcoming nap, not past threshold — day is done.
  return { kind: "disabled" };
}

const MODE_LABEL: Record<ButtonMode["kind"], string> = {
  "end-nap": "End Nap",
  "end-bedtime": "End Bedtime",
  "start-bedtime": "Start Bedtime Now",
  "start-nap": "Start Nap Now",
  disabled: "Day Complete",
};

export function NapActionButton({
  inProgressNap,
  inProgressBedtime,
  dayId,
  nextProjectedNap,
  nowMinutes,
  bedtimeThreshold,
  defaultNapLengthMinutes,
  defaultWakeTime,
  onStart,
  onEnd,
  onStartBedtime,
  onEndBedtime,
}: NapActionButtonProps) {
  const pastThreshold = nowMinutes >= bedtimeThreshold;
  const mode = decideMode(inProgressNap, inProgressBedtime, pastThreshold, nextProjectedNap);

  const handleClick = () => {
    const nowMin = currentLocalMinutes();

    if (mode.kind === "end-nap") {
      void onEnd(mode.nap, nowMin);
      return;
    }

    if (mode.kind === "end-bedtime") {
      void onEndBedtime(mode.bedtime, nowMin);
      return;
    }

    // Past threshold → start bedtime instead. The dashboard primary
    // CTA stays always-actionable; physiology takes over from rhythm
    // once it's bedtime o'clock (DOMAIN.md §3).
    if (mode.kind === "start-bedtime") {
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
    // mode.kind will be "disabled" and the button is non-interactive.
    if (mode.kind === "start-nap") {
      const nap: Event = {
        id: mode.projected.eventKey,
        dayId,
        eventKey: mode.projected.eventKey,
        type: "nap",
        kind: "block",
        label: mode.projected.label,
        startTime: nowMin,
        endTime: nowMin + defaultNapLengthMinutes,
        hasPutdown: false,
        lifecycle: { state: "recorded", annotatedAt: nowMin },
      };
      void onStart(nap);
    }
  };

  const label = MODE_LABEL[mode.kind];
  const isDisabled = mode.kind === "disabled";

  return (
    <ActionButton variant="secondary" onClick={handleClick} disabled={isDisabled}>
      {label}
    </ActionButton>
  );
}
