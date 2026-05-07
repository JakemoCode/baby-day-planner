import type { Day, Event, Settings } from "./types";
import { addMinutes, parseTime } from "./time";
import { intervalForAmount } from "./bottleRules";

export function resolveBottleNapOverlap(
  events: Event[],
  settings: Settings,
  _day: Day,
  nowMinutes: number,
): Event[] {
  const naps = events
    .filter((e) => e.type === "nap" && e.endTime !== undefined)
    .sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));

  if (naps.length === 0) return events;

  // Iterate to a fixed point: a bottle moved to nap-end could cascade
  // subsequent bottles forward; those new positions might fall inside a
  // *different* nap. Loop until either no overlaps remain or we've spent
  // a safety budget. This catches the case Jake hit: nap manually
  // updated, projected bottle previously ahead of nap end now falls in
  // the middle of a later nap after re-cascade.
  const out: Event[] = events.map((e) => ({ ...e }));
  const MAX_PASSES = 8; // O(naps × bottles) per pass; bounded by either naps×bottles convergence

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const projectedBottles = out
      .filter((e) => e.type === "bottle" && e.source === "projected")
      .sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));
    if (projectedBottles.length === 0) break;

    let adjustedThisPass = false;

    for (const b of projectedBottles) {
      const bMins = parseTime(b.startTime);
      const overlap = naps.find(
        (n) => bMins > parseTime(n.startTime) && bMins < parseTime(n.endTime!),
      );
      if (!overlap) continue;

      const startMins = parseTime(overlap.startTime);
      const endMins = parseTime(overlap.endTime!);
      const distToStart = bMins - startMins;
      const distToEnd = endMins - bMins;
      const earlierWins = distToStart <= distToEnd;
      let newTime = earlierWins ? overlap.startTime : overlap.endTime!;
      if (earlierWins && parseTime(newTime) < nowMinutes) {
        newTime = overlap.endTime!;
      }
      const idx = out.findIndex((e) => e.id === b.id);
      out[idx] = { ...out[idx]!, startTime: newTime };
      adjustedThisPass = true;
    }

    // Re-cascade any projected bottles whose chain anchor moved.
    const bottlesSorted = out
      .filter((e) => e.type === "bottle")
      .sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));

    for (let i = 1; i < bottlesSorted.length; i++) {
      const prev = bottlesSorted[i - 1]!;
      const cur = bottlesSorted[i]!;
      if (cur.source !== "projected") continue;
      const interval = intervalForAmount(
        settings.bottleRules,
        prev.amountOz,
        settings.defaultBottleIntervalMinutes,
      );
      const expected = addMinutes(prev.startTime, interval);
      if (cur.startTime !== expected) {
        const idx = out.findIndex((e) => e.id === cur.id);
        out[idx] = { ...out[idx]!, startTime: expected };
        bottlesSorted[i] = { ...cur, startTime: expected };
        adjustedThisPass = true;
      }
    }

    if (!adjustedThisPass) break;
  }

  return out.sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));
}
