import type { Event, TimeMin } from "../../schemas";

export type InstantGroup = {
  startMinutes: TimeMin;
  key: string;
  items: Event[];
};

/**
 * Bucket instants by their TimeMin start. Same fan-vs-stack contract as
 * the V2 helper: events at the same time fan horizontally at one y; they
 * MUST NOT stack vertically (that would falsely imply different times).
 *
 * Block-kind events are filtered out — the timeline renders those
 * separately.
 */
export function groupInstants(events: Event[]): InstantGroup[] {
  const buckets = new Map<TimeMin, Event[]>();
  for (const e of events) {
    if (e.kind !== "instant") continue;
    const list = buckets.get(e.startTime) ?? [];
    list.push(e);
    buckets.set(e.startTime, list);
  }

  return Array.from(buckets.entries())
    .map(([startMinutes, items]) => ({
      startMinutes,
      key: `instant-group-${startMinutes}`,
      items,
    }))
    .sort((a, b) => a.startMinutes - b.startMinutes);
}
