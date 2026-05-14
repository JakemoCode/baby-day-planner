/**
 * Dream feed — render-only label.
 *
 * Per docs/v3/SIMPLIFICATION_SCOPE.md §3: dream feed has ZERO engine
 * logic. At render time, when `settings.dreamFeedEnabled` is true and
 * a bedtime exists in the projection, the FIRST bottle (in startTime
 * order) whose startTime is strictly after `bedtime.startTime` gets
 * relabeled "Dream Feed".
 *
 * Lifecycle-agnostic: recorded bottles are relabeled too. "Dream Feed"
 * is the name of the slot, not a forecast hint — if the user logged a
 * real 10 PM bottle, that IS the dream feed.
 *
 * Subsequent post-bedtime bottles are normal "Bottle N" labels.
 */

import type { Event, Settings } from "../schemas";
import { hasType } from "../engine/helpers";

const isBedtime = hasType("bedtime");
const isBottle = hasType("bottle");

export function applyDreamFeedLabel(events: Event[], settings: Settings): Event[] {
  if (!settings.dreamFeedEnabled) return events;
  const bedtime = events.find(isBedtime);
  if (!bedtime) return events;

  // First-by-startTime selection. Iteration order of the events array
  // is not guaranteed to be time-sorted, so we pick the winner up front.
  const target = events
    .filter((e) => isBottle(e) && e.startTime > bedtime.startTime)
    .reduce<
      Event | undefined
    >((earliest, e) => (earliest === undefined || e.startTime < earliest.startTime ? e : earliest), undefined);
  if (!target) return events;

  return events.map((e) => (e.id === target.id ? { ...e, label: "Dream Feed" } : e));
}
