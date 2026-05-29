import type { Event } from "@/v3/schemas";

export type ContextMode =
  | { kind: "end-bedtime"; bedtime: Event }
  | { kind: "end-nap"; nap: Event }
  | { kind: "hidden" };

export type DecideModeArgs = {
  inProgressBedtime?: Event | undefined;
  inProgressNap?: Event | undefined;
};

export function decideMode(args: DecideModeArgs): ContextMode {
  const { inProgressBedtime, inProgressNap } = args;

  if (inProgressBedtime) {
    return { kind: "end-bedtime", bedtime: inProgressBedtime };
  }

  if (inProgressNap) {
    return { kind: "end-nap", nap: inProgressNap };
  }

  return { kind: "hidden" };
}
