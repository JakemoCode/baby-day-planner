import type { Event, TimeMin } from "../../schemas";

export type InstantGroup = {
  /** Earliest startTime in the group — used to anchor on the time axis. */
  startMinutes: TimeMin;
  /** Latest startTime in the group; equals startMinutes for single-time groups, spans the range for merged clusters. */
  endMinutes: TimeMin;
  /** Stable React key. Single-time groups use a different shape than merged. */
  key: string;
  items: Event[];
};

/** Groups instants by startTime; same-time events fan horizontally, never stack vertically. Blocks excluded. */
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
      endMinutes: startMinutes,
      key: `instant-group-${startMinutes}`,
      items,
    }))
    .sort((a, b) => a.startMinutes - b.startMinutes);
}

/**
 * Merges groups whose chips would overlap on the y-axis into a single collapsed cluster.
 * Strict less-than gap comparison: exact-threshold is "just clears." Transitively chains.
 */
export function mergeNearbyGroups(
  groups: InstantGroup[],
  collisionMinutes: number,
): InstantGroup[] {
  if (groups.length === 0) return [];
  const out: InstantGroup[] = [];
  for (const group of groups) {
    const prev = out[out.length - 1];
    if (prev && group.startMinutes - prev.endMinutes < collisionMinutes) {
      // Merge: extend the previous group to include this one.
      prev.items = [...prev.items, ...group.items];
      prev.endMinutes = Math.max(prev.endMinutes, group.startMinutes);
      // Composite key distinguishes merged group from any single-time donor.
      prev.key = `instant-cluster-${prev.startMinutes}-${prev.endMinutes}`;
    } else {
      // Shallow copy so merges mutate the local copy, not the input.
      out.push({ ...group });
    }
  }
  return out;
}
