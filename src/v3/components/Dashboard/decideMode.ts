import type { Event, TimeMin } from "@/v3/schemas";

export const LOG_BOTTLE_WINDOW_MIN = 15;

export type ContextMode =
  | { kind: "end-bedtime"; bedtime: Event }
  | { kind: "end-nap"; nap: Event }
  /**
   * Log-bottle mode. `alreadyLogged` distinguishes "user can tap to
   * log/confirm this slot" (projected or auto-promoted to recorded
   * via Now-cross) vs "user has explicitly committed it via Log Bottle
   * Now" (lifecycle.state === "completed"). The committed state shows
   * the success label and re-taps surface a confirm dialog rather
   * than firing a silent overwrite.
   */
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

  // End-bedtime mode auto-sunsets once any projected bottle's Log Bottle
  // window opens — prevents the "stays as End overnight sleep all day"
  // bug. Late closure of an unclosed bedtime falls through to the drawer.
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
