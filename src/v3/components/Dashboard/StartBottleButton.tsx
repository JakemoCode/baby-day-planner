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
    return {
      id: newEventId("bottle"),
      dayId,
      eventKey: `bottle_${nextNumber}`,
      type: "bottle",
      kind: "instant",
      label: `Bottle ${nextNumber}`,
      startTime,
      amountOz: defaultAmountOz,
      hasPutdown: false,
      owner: NO_OWNER, // §F37: owner required
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
