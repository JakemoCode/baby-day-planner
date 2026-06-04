import type { Event, TimeMin } from "@/v3/schemas";

export type ContextMode =
  | { kind: "end-bedtime"; bedtime: Event }
  | { kind: "end-nap"; nap: Event }
  | { kind: "hidden" };

export type DecideModeArgs = {
  inProgressBedtime?: Event | undefined;
  inProgressNap?: Event | undefined;
  nowMinutes: TimeMin;
};

export function decideMode(args: DecideModeArgs): ContextMode {
  const { inProgressBedtime, inProgressNap, nowMinutes } = args;

  // "End overnight sleep" only after the clock has wrapped past midnight since
  // bedtime began (now is earlier than bedtime.startTime) — no 8 PM "end sleep" prompt.
  if (inProgressBedtime && nowMinutes < inProgressBedtime.startTime) {
    return { kind: "end-bedtime", bedtime: inProgressBedtime };
  }

  if (inProgressNap) {
    return { kind: "end-nap", nap: inProgressNap };
  }

  return { kind: "hidden" };
}
