"use client";

import { NO_OWNER, type Event, type TimeMin } from "@/v3/schemas";
import { currentLocalMinutes } from "@/v3/ui/time";
import { ActionButton } from "./ActionButton";
import { decideMode, type ContextMode } from "./decideMode";

export type ContextualActionButtonProps = {
  inProgressNap: Event | undefined;
  inProgressBedtime: Event | undefined;
  nextProjectedBottle: Event | undefined;
  dayId: string;
  defaultBottleAmountOz: number;
  nowMinutes: TimeMin;
  onEndNap: (nap: Event, endTime: TimeMin) => Promise<void> | void;
  onWakeRequest: () => void;
  onLogBottle: (bottle: Event) => Promise<void> | void;
};

const MODE_LABEL: Record<Exclude<ContextMode["kind"], "hidden">, string> = {
  "end-bedtime": "End overnight sleep",
  "end-nap": "End Nap",
  "log-bottle": "Log Bottle Time",
};

function buildLoggedBottle(
  projected: Event,
  dayId: string,
  defaultBottleAmountOz: number,
  startTime: TimeMin,
): Event {
  // §F59/§F60: promote the projected bottle's eventKey so dedupBySlotKey
  // collapses the projected/recorded pair into one chip, and downstream
  // cascade re-anchors off this bottle's startTime. The deterministic
  // `recorded_${eventKey}` id makes subsequent drawer edits / re-taps
  // overwrite the same Firestore doc.
  return {
    id: `recorded_${projected.eventKey}`,
    dayId,
    eventKey: projected.eventKey,
    type: "bottle",
    kind: "instant",
    label: projected.label,
    startTime,
    amountOz: defaultBottleAmountOz,
    hasPutdown: false,
    owner: projected.owner ?? NO_OWNER,
    lifecycle: { state: "completed", committedAt: startTime },
  };
}

export function ContextualActionButton({
  inProgressNap,
  inProgressBedtime,
  nextProjectedBottle,
  dayId,
  defaultBottleAmountOz,
  nowMinutes,
  onEndNap,
  onWakeRequest,
  onLogBottle,
}: ContextualActionButtonProps) {
  const mode = decideMode({
    inProgressBedtime,
    inProgressNap,
    nextProjectedBottle,
    nowMinutes,
  });

  if (mode.kind === "hidden") return null;

  const handleClick = () => {
    const nowMin = currentLocalMinutes();
    switch (mode.kind) {
      case "end-bedtime":
        onWakeRequest();
        return;
      case "end-nap":
        void onEndNap(mode.nap, nowMin);
        return;
      case "log-bottle": {
        const bottle = buildLoggedBottle(mode.projected, dayId, defaultBottleAmountOz, nowMin);
        void onLogBottle(bottle);
        return;
      }
    }
  };

  return (
    <ActionButton variant="primary" onClick={handleClick}>
      {MODE_LABEL[mode.kind]}
    </ActionButton>
  );
}
