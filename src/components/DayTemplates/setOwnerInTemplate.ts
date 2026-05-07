import type { Event, Owner, OwnershipTemplate } from "@/domain";

/** Event types that carry an owner via the OwnershipTemplate. */
export const ASSIGNABLE_TYPES: ReadonlyArray<Event["type"]> = [
  "nap",
  "wake_window",
  "bottle",
  "bedtime",
];

function indexFromKey(eventKey: string, prefix: string): number {
  const m = new RegExp(`^${prefix}_(\\d+)`).exec(eventKey);
  return m ? Number(m[1]) - 1 : -1;
}

/**
 * Returns a copy of the template with the chosen event's slot updated to
 * the given owner. Out-of-range or unrecognised events leave the template
 * unchanged. Used by both the Day Templates page and the Tomorrow preview.
 */
export function setOwnerInTemplate(
  template: OwnershipTemplate,
  event: Event,
  owner: Owner,
): OwnershipTemplate {
  const next = { ...template };
  if (event.type === "nap") {
    const i = indexFromKey(event.eventKey, "nap");
    if (i < 0) return template;
    const arr = [...template.napOwners];
    while (arr.length <= i) arr.push("Jake");
    arr[i] = owner;
    next.napOwners = arr;
  } else if (event.type === "wake_window") {
    const i = indexFromKey(event.eventKey, "wake_window");
    if (i < 0) return template;
    const arr = [...template.wakeWindowOwners];
    while (arr.length <= i) arr.push("Kelly");
    arr[i] = owner;
    next.wakeWindowOwners = arr;
  } else if (event.type === "bottle") {
    const i = indexFromKey(event.eventKey, "bottle");
    if (i < 0) return template;
    const arr = [...(template.bottleOwners ?? [])];
    while (arr.length <= i) arr.push("Jake");
    arr[i] = owner;
    next.bottleOwners = arr;
  } else if (event.type === "bedtime") {
    next.bedtimeOwner = owner;
  }
  return next;
}
