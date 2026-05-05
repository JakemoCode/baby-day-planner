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

  const projectedBottles = events
    .filter((e) => e.type === "bottle" && e.source === "projected")
    .sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));

  if (projectedBottles.length === 0 || naps.length === 0) return events;

  const adjusted = new Map<string, string>();

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
    adjusted.set(b.id, newTime);
  }

  if (adjusted.size === 0) return events;

  const out: Event[] = events.map((e) => ({ ...e }));
  for (const b of projectedBottles) {
    const newStart = adjusted.get(b.id);
    if (newStart) {
      const idx = out.findIndex((e) => e.id === b.id);
      out[idx] = { ...out[idx]!, startTime: newStart };
    }
  }

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
    }
  }

  return out.sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));
}
