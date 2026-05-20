"use client";

import { NO_OWNER, type Event, type TimeMin } from "@/v3/schemas";
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
  | { kind: "start-nap"; projected: Event };

// Priority chain:
//  - End an in-progress sleep first (nap wins over bedtime if both somehow
//    coexist; cascade prevents that in practice).
//  - Past threshold → start bedtime (DOMAIN.md §3 — bedtime is bedtime).
//  - Else if cascade projected a next nap → start that nap.
//  - Else → fall back to start-bedtime. Defaulting to start-bedtime keeps
//    the CTA always actionable; the user can always anchor bedtime since
//    saveEvent's deterministic id="bedtime" just updates the existing doc.
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
  return { kind: "start-bedtime" };
}

const MODE_LABEL: Record<ButtonMode["kind"], string> = {
  "end-nap": "End Nap",
  "end-bedtime": "End overnight sleep",
  "start-bedtime": "Start Bedtime Now",
  "start-nap": "Start Nap Now",
};

export function NapActionButton({
  inProgressNap,
  inProgressBedtime,
  dayId,
  nextProjectedNap,
  nowMinutes,
  bedtimeThreshold,
  defaultNapLengthMinutes: _defaultNapLengthMinutes,
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
        owner: NO_OWNER, // §F37: owner is required
        lifecycle: { state: "recorded", annotatedAt: nowMin },
      };
      void onStartBedtime(bedtime);
      return;
    }

    // Standard path: promote nextProjectedNap. Under the physiology
    // cascade nextProjectedNap is always defined within-day; if it's
    // absent (e.g. completed bedtime suppresses all subsequent naps),
    // decideMode would have returned "start-bedtime" instead, so this
    // branch is reachable only when nextProjectedNap exists.
    if (mode.kind === "start-nap") {
      // Omit endTime: "Start Nap Now, waiting for End Nap" — effectiveEndOf
      // auto-extends the placeholder as time passes until the user taps
      // End Nap (which sets endTime + flips to completed) or opens the
      // drawer (which always writes endTime). The undefined endTime is
      // the marker that distinguishes "in progress" from "user-committed
      // extent" (Jake's 2026-05-20 bug fix).
      const nap: Event = {
        id: mode.projected.eventKey,
        dayId,
        eventKey: mode.projected.eventKey,
        type: "nap",
        kind: "block",
        label: mode.projected.label,
        startTime: nowMin,
        hasPutdown: false,
        owner: mode.projected.owner, // §F37: pass through (NO_OWNER if unassigned)
        lifecycle: { state: "recorded", annotatedAt: nowMin },
      };
      void onStart(nap);
    }
  };

  const label = MODE_LABEL[mode.kind];

  return (
    <ActionButton variant="primary" onClick={handleClick}>
      {label}
    </ActionButton>
  );
}
