/**
 * Dream feed — render-only label.
 *
 * Per docs/v3/SIMPLIFICATION_SCOPE.md §3: dream feed has ZERO engine
 * logic. The engine emits regular bottles. At render time, when
 * `settings.dreamFeedEnabled` is true and a bedtime exists in the
 * projection, the FIRST projected bottle whose startTime is strictly
 * after `bedtime.startTime` gets relabeled "Dream Feed".
 *
 * Recorded bottles (started/completed) keep their recorded label —
 * "Dream Feed" is a forecast hint, not retroactive renaming. If the
 * user actually fed a 10 PM bottle, they recorded a bottle; whether it
 * counts as the dream feed is moot once it's logged.
 *
 * Subsequent post-bedtime bottles are normal "Bottle N" labels.
 */

import type { Event, Settings } from "../schemas";
import { hasType, isProjected } from "../engine/helpers";

const isBedtime = hasType("bedtime");
const isBottle = hasType("bottle");

export function applyDreamFeedLabel(events: Event[], settings: Settings): Event[] {
  if (!settings.dreamFeedEnabled) return events;
  const bedtime = events.find(isBedtime);
  if (!bedtime) return events;

  let labeled = false;
  return events.map((e) => {
    if (labeled) return e;
    if (!isBottle(e)) return e;
    if (!isProjected(e)) return e;
    if (e.startTime <= bedtime.startTime) return e;
    labeled = true;
    return { ...e, label: "Dream Feed" };
  });
}
