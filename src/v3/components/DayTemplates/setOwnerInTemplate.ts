/**
 * Update a single owner slot on an OwnershipTemplate based on the
 * event's `eventKey`. See setOwnerInTemplate.test.ts for the
 * behavioral contract (gap-fill semantics, undefined = clear,
 * unknown eventKey = no-op).
 *
 * V3 differences from V2:
 *  - Operates on OwnerRef (slot-based) not Owner (display string).
 *  - Dispatches on `eventKey` (`nap_N`, `wake_window_N`, `bottle_N`,
 *    `bedtime`) rather than `event.type`, since multiple types share
 *    indices via their key.
 *  - Gap-fills with `undefined` instead of a hardcoded V2 owner name.
 */

import type { Event, OwnerRef, OwnershipTemplate } from "../../schemas";

const NAP_RE = /^nap_(\d+)$/;
const WAKE_RE = /^wake_window_(\d+)$/;
const BOTTLE_RE = /^bottle_(\d+)$/;

function indexOf(re: RegExp, eventKey: string): number {
  const m = re.exec(eventKey);
  if (!m) return -1;
  return Number(m[1]) - 1;
}

/** Return a copy of `arr` with `owner` placed at index `i`, gap-filling
 * intermediate slots with `undefined`. The returned array is widened to
 * include `undefined` entries; callers must tolerate sparse owners. */
function placeAt(arr: ReadonlyArray<OwnerRef>, i: number, owner: OwnerRef | undefined): OwnerRef[] {
  const next = arr.slice() as Array<OwnerRef | undefined>;
  while (next.length <= i) next.push(undefined);
  next[i] = owner;
  return next as OwnerRef[];
}

export function setOwnerInTemplate(
  template: OwnershipTemplate,
  event: Event,
  owner: OwnerRef | undefined,
): OwnershipTemplate {
  const { eventKey } = event;

  if (eventKey === "bedtime") {
    if (owner === undefined) {
      const { bedtimeOwner: _drop, ...rest } = template;
      return rest;
    }
    return { ...template, bedtimeOwner: owner };
  }

  const napIdx = indexOf(NAP_RE, eventKey);
  if (napIdx >= 0) {
    return { ...template, napOwners: placeAt(template.napOwners, napIdx, owner) };
  }

  const wwIdx = indexOf(WAKE_RE, eventKey);
  if (wwIdx >= 0) {
    return {
      ...template,
      wakeWindowOwners: placeAt(template.wakeWindowOwners, wwIdx, owner),
    };
  }

  const bottleIdx = indexOf(BOTTLE_RE, eventKey);
  if (bottleIdx >= 0) {
    return {
      ...template,
      bottleOwners: placeAt(template.bottleOwners ?? [], bottleIdx, owner),
    };
  }

  return template;
}
