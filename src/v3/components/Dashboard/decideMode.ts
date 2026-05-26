import type { Event, TimeMin } from "@/v3/schemas";

const LOG_BOTTLE_WINDOW_MIN = 15;

export type ContextMode =
  | { kind: "end-bedtime"; bedtime: Event }
  | { kind: "end-nap"; nap: Event }
  | { kind: "log-bottle"; projected: Event }
  | { kind: "hidden" };

export type DecideModeArgs = {
  inProgressBedtime?: Event;
  inProgressNap?: Event;
  nextProjectedBottle?: Event;
  nowMinutes: TimeMin;
};

function bottleWindowOpen(nextProjectedBottle: Event | undefined, now: TimeMin): boolean {
  if (!nextProjectedBottle) return false;
  return Math.abs(now - nextProjectedBottle.startTime) <= LOG_BOTTLE_WINDOW_MIN;
}

export function decideMode(args: DecideModeArgs): ContextMode {
  const { inProgressBedtime, inProgressNap, nextProjectedBottle, nowMinutes } = args;

  // End-bedtime mode auto-sunsets once any projected bottle's Log Bottle
  // window opens — prevents the "stays as End overnight sleep all day"
  // bug. Late closure of an unclosed bedtime falls through to the drawer.
  if (inProgressBedtime && !bottleWindowOpen(nextProjectedBottle, nowMinutes)) {
    return { kind: "end-bedtime", bedtime: inProgressBedtime };
  }

  if (inProgressNap) {
    return { kind: "end-nap", nap: inProgressNap };
  }

  if (bottleWindowOpen(nextProjectedBottle, nowMinutes)) {
    return { kind: "log-bottle", projected: nextProjectedBottle! };
  }

  return { kind: "hidden" };
}
