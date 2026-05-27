"use client";

import { useState } from "react";
import { NO_OWNER, type Event, type TimeMin } from "@/v3/schemas";
import { currentLocalMinutes } from "@/v3/ui/time";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
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
  "end-nap": "End nap",
  "log-bottle": "Log bottle now",
};

const LOGGED_LABEL = "✓ Bottle logged";

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

  const [confirmOpen, setConfirmOpen] = useState(false);

  if (mode.kind === "hidden") return null;

  const performLog = (projected: Event) => {
    const nowMin = currentLocalMinutes();
    const bottle = buildLoggedBottle(projected, dayId, defaultBottleAmountOz, nowMin);
    void onLogBottle(bottle);
  };

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
        // Re-tap on an already-logged slot surfaces a confirm dialog
        // ("change the recorded time?") rather than a silent overwrite.
        if (mode.alreadyLogged) {
          setConfirmOpen(true);
          return;
        }
        performLog(mode.projected);
        return;
      }
    }
  };

  const label =
    mode.kind === "log-bottle" && mode.alreadyLogged ? LOGGED_LABEL : MODE_LABEL[mode.kind];

  // Wall-clock minutes since the recorded bottle's startTime — drives
  // the "logged X minutes ago" text in the confirm dialog. Only used
  // when mode is log-bottle + alreadyLogged.
  const minutesAgo =
    mode.kind === "log-bottle" && mode.alreadyLogged
      ? Math.max(0, nowMinutes - mode.projected.startTime)
      : 0;

  return (
    <>
      <ActionButton variant="primary" onClick={handleClick} aria-live="polite">
        {label}
      </ActionButton>
      <ConfirmDialog
        open={confirmOpen}
        title="Change the recorded time?"
        body={`Last bottle logged ${minutesAgo} minute${minutesAgo === 1 ? "" : "s"} ago. Tap Confirm to update to now.`}
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          if (mode.kind === "log-bottle") performLog(mode.projected);
        }}
      />
    </>
  );
}
