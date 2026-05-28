import type { Event, TimeMin } from "@/v3/schemas";

export const LOG_BOTTLE_WINDOW_MIN = 15;

export type ContextMode =
  | { kind: "end-bedtime"; bedtime: Event }
  | { kind: "end-nap"; nap: Event }
  /** `alreadyLogged` true = lifecycle "completed"; re-tap shows confirm dialog instead of silent overwrite. */
  | { kind: "log-bottle"; projected: Event; alreadyLogged: boolean }
  | { kind: "hidden" };

export type DecideModeArgs = {
  inProgressBedtime?: Event | undefined;
  inProgressNap?: Event | undefined;
  nextProjectedBottle?: Event | undefined;
  nowMinutes: TimeMin;
};

function bottleInWindow(nextProjectedBottle: Event | undefined, now: TimeMin): Event | undefined {
  if (!nextProjectedBottle) return undefined;
  if (Math.abs(now - nextProjectedBottle.startTime) > LOG_BOTTLE_WINDOW_MIN) return undefined;
  return nextProjectedBottle;
}

export function decideMode(args: DecideModeArgs): ContextMode {
  const { inProgressBedtime, inProgressNap, nextProjectedBottle, nowMinutes } = args;
  const inWindow = bottleInWindow(nextProjectedBottle, nowMinutes);

  // End-bedtime auto-sunsets when a bottle window opens; prevents "stuck as End overnight sleep" bug.
  if (inProgressBedtime && !inWindow) {
    return { kind: "end-bedtime", bedtime: inProgressBedtime };
  }

  if (inProgressNap) {
    return { kind: "end-nap", nap: inProgressNap };
  }

  if (inWindow) {
    return {
      kind: "log-bottle",
      projected: inWindow,
      alreadyLogged: inWindow.lifecycle.state === "completed",
    };
  }

  return { kind: "hidden" };
}
