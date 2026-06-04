"use client";

import { type Event, type TimeMin } from "@/v3/schemas";
import { currentLocalMinutes } from "@/v3/ui/time";
import { ActionButton } from "./ActionButton";
import { decideMode, type ContextMode } from "./decideMode";

export type ContextualActionButtonProps = {
  inProgressNap: Event | undefined;
  inProgressBedtime: Event | undefined;
  nowMinutes: TimeMin;
  onEndNap: (nap: Event, endTime: TimeMin) => Promise<void> | void;
  onWakeRequest: () => void;
};

const MODE_LABEL: Record<Exclude<ContextMode["kind"], "hidden">, string> = {
  "end-bedtime": "End overnight sleep",
  "end-nap": "End nap",
};

export function ContextualActionButton({
  inProgressNap,
  inProgressBedtime,
  nowMinutes,
  onEndNap,
  onWakeRequest,
}: ContextualActionButtonProps) {
  const mode = decideMode({ inProgressBedtime, inProgressNap, nowMinutes });

  if (mode.kind === "hidden") return null;

  const handleClick = () => {
    switch (mode.kind) {
      case "end-bedtime":
        onWakeRequest();
        return;
      case "end-nap":
        void onEndNap(mode.nap, currentLocalMinutes());
        return;
    }
  };

  return (
    <ActionButton variant="primary" onClick={handleClick} aria-live="polite">
      {MODE_LABEL[mode.kind]}
    </ActionButton>
  );
}
