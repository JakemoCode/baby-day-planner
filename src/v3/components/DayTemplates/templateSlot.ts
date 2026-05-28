/** Maps Event → OwnershipTemplate slot by eventKey; extras, pumps, and malformed keys return undefined. */

import type { Event, OwnerRef, OwnerSlotEntry, OwnershipTemplate } from "../../schemas";

export type TemplateSlot =
  | { kind: "bedtime" }
  | { kind: "nap" | "wakeWindow" | "bottle"; index: number };

const INDEXED_PATTERNS = [
  ["nap", /^nap_(\d+)$/],
  ["wakeWindow", /^wake_window_(\d+)$/],
  ["bottle", /^bottle_(\d+)$/],
] as const;

/** Returns the template slot for the event; undefined for unmapped types. eventKey suffix is 1-based → 0-based index. */
export function templateSlotForEvent(event: Event): TemplateSlot | undefined {
  const { eventKey } = event;
  if (eventKey === "bedtime") return { kind: "bedtime" };
  for (const [kind, re] of INDEXED_PATTERNS) {
    const m = re.exec(eventKey);
    if (m) return { kind, index: Number(m[1]) - 1 };
  }
  return undefined;
}

/** Returns the owner at the given slot, or undefined if empty or out of bounds. */
export function getOwnerAt(template: OwnershipTemplate, slot: TemplateSlot): OwnerRef | undefined {
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

/** Places `owner` at index `i`, gap-filling with undefined; engine skips undefined entries at projection. */
function placeAt(
  arr: ReadonlyArray<OwnerSlotEntry>,
  i: number,
  owner: OwnerSlotEntry,
): OwnerSlotEntry[] {
  const next: OwnerSlotEntry[] = arr.slice();
  while (next.length <= i) next.push(undefined);
  next[i] = owner;
  return next;
}

/** Returns a new template with the slot's owner replaced. `undefined` clears; bedtime clears by key removal (exactOptionalPropertyTypes). */
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
