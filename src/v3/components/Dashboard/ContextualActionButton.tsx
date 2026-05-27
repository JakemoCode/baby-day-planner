"use client";

import { useEffect, useState } from "react";
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
/**
 * How long the "✓ Bottle logged" affordance stays visible after a
 * successful log before the button auto-hides. Without a timeout the
 * label sticks for the full ±15min log-bottle window — masking any
 * subsequent end-nap mode that would have shown up when the projected
 * nap auto-promotes a moment later. (Jake 2026-05-27 dogfood.)
 */
const LOGGED_AFFORDANCE_MS = 4000;

/**
 * Renders nothing; fires `onExpire` after `ms`. Mount with a unique
 * key for each affordance instance — unmounting clears the timer.
 */
function AffordanceTimer({ ms, onExpire }: { ms: number; onExpire: () => void }) {
  useEffect(() => {
    const t = setTimeout(onExpire, ms);
    return () => clearTimeout(t);
  }, [ms, onExpire]);
  return null;
}

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
  // Track when the "✓ Bottle logged" affordance entered, by the
  // recorded bottle's id. A new id (or no affordance) means "not
  // currently showing the logged affordance" — see <AffordanceTimer/>.
  const isLoggedAffordance = mode.kind === "log-bottle" && mode.alreadyLogged;
  const loggedKey = isLoggedAffordance ? mode.projected.id : null;
  const [expiredKey, setExpiredKey] = useState<string | null>(null);

  if (mode.kind === "hidden") return null;
  // After the affordance window, hide so end-nap (or whatever fires
  // next) can take over. decideMode is bedtime > nap > bottle, so if
  // an in-progress event existed the button would already have switched
  // away — only the "between log and next event" gap reaches here.
  if (isLoggedAffordance && expiredKey === loggedKey) return null;

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
      {loggedKey !== null && expiredKey !== loggedKey && (
        <AffordanceTimer
          key={loggedKey}
          ms={LOGGED_AFFORDANCE_MS}
          onExpire={() => setExpiredKey(loggedKey)}
        />
      )}
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
