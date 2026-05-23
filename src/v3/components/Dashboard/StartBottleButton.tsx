"use client";

import { useEffect, useState } from "react";
import { NO_OWNER, type Event, type TimeMin } from "@/v3/schemas";
import { newEventId } from "@/v3/lib/newEventId";
import { currentLocalMinutes } from "@/v3/ui/time";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ActionButton } from "./ActionButton";

export type StartBottleButtonProps = {
  defaultAmountOz: number;
  dayId: string;
  /**
   * The next-upcoming projected bottle. Start Bottle PROMOTES that
   * projection (reuses its eventKey + label + owner) so the cascade
   * keys off the same `bottle_N` slot and `dedupBySlotKey` cleanly
   * collapses the projected-vs-recorded pair into one render-list
   * entry. Mirrors NapActionButton's §F24 nap-promotion shape.
   *
   * When undefined (rare — past bedtime / past the last projected
   * bottle in the chain), falls back to inventing a fresh slot via
   * `nextNumber` so the user can still log an out-of-chain bottle.
   */
  nextProjectedBottle?: Event;
  /** Fallback slot index when no projected bottle exists. */
  nextNumber: number;
  onLog: (bottle: Event) => Promise<void>;
  /** Minutes between Day.wakeTime and the soon-after-last guard threshold. */
  minIntervalMinutes: number;
  /** TimeMin of the most recent bottle. Used by the soon-after-last guard. */
  lastBottleTime?: TimeMin;
};

const FEEDBACK_DURATION_MS = 1500;

export function StartBottleButton({
  defaultAmountOz,
  dayId,
  nextProjectedBottle,
  nextNumber,
  onLog,
  minIntervalMinutes,
  lastBottleTime,
}: StartBottleButtonProps) {
  const [logged, setLogged] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!logged) return;
    const t = setTimeout(() => setLogged(false), FEEDBACK_DURATION_MS);
    return () => clearTimeout(t);
  }, [logged]);

  const buildBottle = (): Event => {
    const startTime = currentLocalMinutes();
    // §F60: promote the next projected bottle's eventKey so the cascade
    // and renderProjection.dedupBySlotKey treat the new recorded bottle
    // as filling the SAME slot the engine had projected — no duplicate
    // chip, and the forward cascade re-anchors off this bottle's
    // startTime. Falls back to inventing a fresh slot only when no
    // projected bottle is available (e.g. past last projected bottle).
    const eventKey = nextProjectedBottle?.eventKey ?? `bottle_${nextNumber}`;
    const label = nextProjectedBottle?.label ?? `Bottle ${nextNumber}`;
    const owner = nextProjectedBottle?.owner ?? NO_OWNER;
    return {
      // §F59: deterministic id keyed to eventKey so subsequent drawer
      // edits / re-taps overwrite the same Firestore doc instead of
      // creating an orphan with a divergent id. Mirrors NapActionButton.
      id: nextProjectedBottle ? `recorded_${eventKey}` : newEventId("bottle"),
      dayId,
      eventKey,
      type: "bottle",
      kind: "instant",
      label,
      startTime,
      amountOz: defaultAmountOz,
      hasPutdown: false,
      owner, // §F37: owner required
      lifecycle: { state: "completed", committedAt: startTime },
    };
  };

  const performLog = async () => {
    if (pending) return;
    setPending(true);
    try {
      await onLog(buildBottle());
      setLogged(true);
    } finally {
      setPending(false);
    }
  };

  const handleClick = () => {
    if (pending) return;
    if (lastBottleTime !== undefined) {
      const gap = currentLocalMinutes() - lastBottleTime;
      if (gap >= 0 && gap < minIntervalMinutes) {
        setConfirmOpen(true);
        return;
      }
    }
    void performLog();
  };

  const label = logged ? "✓ Bottle logged" : "Start Bottle Now";

  const minutesAgo = lastBottleTime !== undefined ? currentLocalMinutes() - lastBottleTime : null;

  return (
    <>
      <ActionButton variant="primary" onClick={handleClick} disabled={pending} aria-live="polite">
        {label}
      </ActionButton>
      <ConfirmDialog
        open={confirmOpen}
        title="Start another bottle now?"
        body={
          minutesAgo !== null
            ? `Last bottle was ${minutesAgo} min ago. Tap Confirm to log a new bottle anyway.`
            : "Tap Confirm to log a new bottle."
        }
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={async () => {
          setConfirmOpen(false);
          await performLog();
        }}
      />
    </>
  );
}
