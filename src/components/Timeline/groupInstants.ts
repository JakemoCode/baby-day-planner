import type { Event } from "@/domain";
import { parseTime } from "@/domain";

export type InstantGroup = {
  /** Minutes-since-midnight; the y-anchor for every chip in this group. */
  startMinutes: number;
  /** Stable string key for React `key` prop — derived from time. */
  key: string;
  /** All instants firing at this exact time. ≥1 element. */
  items: Event[];
};

/**
 * Bucket instants by their `startTime`. Critical anti-requirement of the V1
 * gutter design: events at the same time must fan **horizontally** at the
 * same y. They MUST NOT stack vertically — vertical stacking would falsely
 * imply different times. The component renders one cluster per group so the
 * fan-vs-stack rule is enforced by structure, not styling.
 *
 * Block-kind events are filtered out by this helper; the timeline renders
 * those separately.
 *
 * Returned groups are sorted ascending by `startMinutes`.
 */
export function groupInstants(events: Event[]): InstantGroup[] {
  const buckets = new Map<string, Event[]>();
  for (const e of events) {
    if (e.kind !== "instant") continue;
    const list = buckets.get(e.startTime) ?? [];
    list.push(e);
    buckets.set(e.startTime, list);
  }

  return Array.from(buckets.entries())
    .map(([startTime, items]) => ({
      startMinutes: parseTime(startTime),
      key: `instant-group-${startTime}`,
      items,
    }))
    .sort((a, b) => a.startMinutes - b.startMinutes);
}
