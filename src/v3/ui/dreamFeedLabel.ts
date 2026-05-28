/**
 * Render-only "Dream Feed" label (SIMPLIFICATION_SCOPE.md §3 — zero engine logic).
 * Relabels the first bottle (by startTime) after bedtime when `dreamFeedEnabled`.
 * Lifecycle-agnostic: a recorded post-bedtime bottle IS the dream feed.
 */

import type { Event, Settings } from "../schemas";
import { hasType } from "../engine/helpers";

const isBedtime = hasType("bedtime");
const isBottle = hasType("bottle");

export function applyDreamFeedLabel(events: Event[], settings: Settings): Event[] {
  if (!settings.dreamFeedEnabled) return events;
  const bedtime = events.find(isBedtime);
  if (!bedtime) return events;

  // events array isn't time-sorted, so pick the earliest post-bedtime bottle explicitly.
  const target = events
    .filter((e) => isBottle(e) && e.startTime > bedtime.startTime)
    .reduce<
      Event | undefined
    >((earliest, e) => (earliest === undefined || e.startTime < earliest.startTime ? e : earliest), undefined);
  if (!target) return events;

  return events.map((e) => (e.id === target.id ? { ...e, label: "Dream Feed" } : e));
}
