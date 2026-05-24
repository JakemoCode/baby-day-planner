import type { Event, TimeMin } from "../../schemas";

export type InstantGroup = {
  /** Earliest startTime in the group — used to anchor on the time axis. */
  startMinutes: TimeMin;
  /**
   * Latest startTime among members. For a single-time group this equals
   * `startMinutes`; for a merged-nearby group (see {@link mergeNearbyGroups})
   * it spans the time range covered by the cluster. Used by the
   * collapsed-cluster chip to display "5:32–5:40p"-style ranges.
   */
  endMinutes: TimeMin;
  /** Stable React key. Single-time groups use a different shape than merged. */
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
      endMinutes: startMinutes,
      key: `instant-group-${startMinutes}`,
      items,
    }))
    .sort((a, b) => a.startMinutes - b.startMinutes);
}

/**
 * §F55 — second-pass merge of {@link groupInstants} output. Any two
 * groups whose vertical render boxes would overlap on the timeline get
 * collapsed into a single composite group. The collapsed cluster renders
 * as a single "N events" chip that opens a sheet listing each member.
 *
 * `collisionMinutes` is the time gap at which two clusters' chips would
 * start to overlap on the y-axis. Callers compute it from chip height
 * and `pxPerMin`: e.g. at 120 px/h (2 px/min), a 38 px chip + 4 px gap
 * collides at 21 minutes apart.
 *
 * Merge rule: strict less-than on the gap (`next.startMinutes - prev.endMinutes < collisionMinutes`)
 * so an exact-threshold gap is treated as "just clears" rather than
 * "just collides" — keeps semantics easy to reason about at boundary
 * times.
 *
 * Transitively chains: A near B, B near C → all three collapse into one
 * composite. The "previous" boundary advances to the latest member each
 * iteration, so the chain only collapses what genuinely overlaps.
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
      // Composite key: lists all member startMinutes so React can tell
      // a merged group apart from any of its single-time donors.
      prev.key = `instant-cluster-${prev.startMinutes}-${prev.endMinutes}`;
    } else {
      // Copy so subsequent merges mutate the local copy, not the input.
      out.push({ ...group });
    }
  }
  return out;
}
