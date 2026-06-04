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

/**
 * "End overnight sleep" only once we're past midnight, so it never appears the
 * evening bedtime is logged (the 8 PM "end sleep" prompt). An evening (PM) bedtime
 * qualifies once the clock has wrapped below its start; a bedtime logged after
 * midnight (AM start) is already past midnight, so it qualifies immediately —
 * otherwise the CTA, the sole entry to the morning-wake flow, would never appear.
 */
function pastMidnightSince(bedtime: Event, nowMinutes: TimeMin): boolean {
  const startedInEvening = bedtime.startTime >= 12 * 60;
  return startedInEvening ? nowMinutes < bedtime.startTime : true;
}

export function decideMode(args: DecideModeArgs): ContextMode {
  const { inProgressBedtime, inProgressNap, nowMinutes } = args;

  if (inProgressBedtime && pastMidnightSince(inProgressBedtime, nowMinutes)) {
    return { kind: "end-bedtime", bedtime: inProgressBedtime };
  }

  if (inProgressNap) {
    return { kind: "end-nap", nap: inProgressNap };
  }

  return { kind: "hidden" };
}
