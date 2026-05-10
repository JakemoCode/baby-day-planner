/**
 * Shared dispatch from `Event` -> the slot it occupies inside an
 * OwnershipTemplate. Both TemplateOwnerPicker (read side) and
 * setOwnerInTemplate (write side) consume this so the eventKey regex
 * lives in one place.
 *
 * Slot kinds mirror the OwnershipTemplate shape:
 *   - bedtime              -> template.bedtimeOwner
 *   - nap[index]           -> template.napOwners[index]
 *   - wakeWindow[index]    -> template.wakeWindowOwners[index]
 *   - bottle[index]        -> template.bottleOwners[index]
 *
 * Events that don't map to a template slot (extras, pumps, malformed
 * eventKeys) return undefined.
 */

import type { Event, OwnerRef, OwnershipTemplate } from "../../schemas";

export type TemplateSlot =
  | { kind: "bedtime" }
  | { kind: "nap" | "wakeWindow" | "bottle"; index: number };

const INDEXED_PATTERNS = [
  ["nap", /^nap_(\d+)$/],
  ["wakeWindow", /^wake_window_(\d+)$/],
  ["bottle", /^bottle_(\d+)$/],
] as const;

/** Returns undefined for events that don't map to a template slot
 * (e.g. extras, pumps, malformed eventKeys). Index is 0-based — the
 * 1-based suffix in the eventKey (`nap_1`) maps to index 0. */
export function templateSlotForEvent(event: Event): TemplateSlot | undefined {
  const { eventKey } = event;
  if (eventKey === "bedtime") return { kind: "bedtime" };
  for (const [kind, re] of INDEXED_PATTERNS) {
    const m = re.exec(eventKey);
    if (m) return { kind, index: Number(m[1]) - 1 };
  }
  return undefined;
}

/** Read the owner currently assigned to the slot in the template.
 * Returns undefined when the slot is empty or out of bounds. */
export function getOwnerAt(
  template: OwnershipTemplate,
  slot: TemplateSlot,
): OwnerRef | undefined {
  switch (slot.kind) {
    case "bedtime":
      return template.bedtimeOwner;
    case "nap":
      return template.napOwners[slot.index];
    case "wakeWindow":
      return template.wakeWindowOwners[slot.index];
    case "bottle":
      return (template.bottleOwners ?? [])[slot.index];
  }
}

/** Return a copy of `arr` with `owner` placed at index `i`, gap-filling
 * intermediate slots with `undefined`. The returned array is widened to
 * include `undefined` entries; callers tolerate sparse owners (tracked
 * separately as cleanup §1.6). */
function placeAt(
  arr: ReadonlyArray<OwnerRef>,
  i: number,
  owner: OwnerRef | undefined,
): OwnerRef[] {
  const next = arr.slice() as Array<OwnerRef | undefined>;
  while (next.length <= i) next.push(undefined);
  next[i] = owner;
  return next as OwnerRef[];
}

/** Returns a new OwnershipTemplate with the slot's owner replaced.
 * Pure / immutable. Passing `undefined` clears the slot — for bedtime
 * the property is removed entirely (to satisfy
 * exactOptionalPropertyTypes); for indexed slots the entry becomes
 * undefined in place. */
export function setOwnerAt(
  template: OwnershipTemplate,
  slot: TemplateSlot,
  owner: OwnerRef | undefined,
): OwnershipTemplate {
  switch (slot.kind) {
    case "bedtime": {
      if (owner === undefined) {
        const { bedtimeOwner: _drop, ...rest } = template;
        return rest;
      }
      return { ...template, bedtimeOwner: owner };
    }
    case "nap":
      return { ...template, napOwners: placeAt(template.napOwners, slot.index, owner) };
    case "wakeWindow":
      return {
        ...template,
        wakeWindowOwners: placeAt(template.wakeWindowOwners, slot.index, owner),
      };
    case "bottle":
      return {
        ...template,
        bottleOwners: placeAt(template.bottleOwners ?? [], slot.index, owner),
      };
  }
}
