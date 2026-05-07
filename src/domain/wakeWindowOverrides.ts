import type { Event } from "./types";

/**
 * Merge user-edited wake_window overrides into the projected events. Only
 * the metadata fields (owner, label) flow through — startTime and endTime
 * are owned by the cascade in applyNapActuals so a stale ww override doesn't
 * clobber a freshly-recomputed time. Mirrors applyNapActuals's split between
 * "what the user said" (metadata) and "where the chain says it goes" (time).
 *
 * Why time isn't honored: a user might tap a projected wake_window once just
 * to set the owner; that creates a manual doc carrying the *projected* time
 * at the moment of the edit. Days later, after actual naps shift the chain,
 * the projected time on that override is wrong — but ownership is still
 * valid. By only merging owner/label, we keep the override useful without
 * it permanently cementing stale geometry.
 */
export function applyWakeWindowOverrides(events: Event[], actuals: Event[]): Event[] {
  const overrides = new Map<string, Event>();
  for (const a of actuals) {
    if (a.type !== "wake_window") continue;
    if (a.source !== "manual" && a.source !== "actual") continue;
    overrides.set(a.eventKey, a);
  }
  if (overrides.size === 0) return events;
  return events.map((e) => {
    if (e.type !== "wake_window") return e;
    const override = overrides.get(e.eventKey);
    if (!override) return e;
    // Carry only metadata fields. startTime / endTime stay as the cascade
    // computed them. owner is omitted explicitly when override.owner is
    // undefined so the user's "clear owner" choice still propagates (per
    // exactOptionalPropertyTypes; assigning undefined is rejected).
    const next: Event = {
      ...e,
      ...(override.label ? { label: override.label } : {}),
      source: override.source,
      status: override.status,
    };
    if (override.owner !== undefined) {
      next.owner = override.owner;
    } else {
      delete (next as { owner?: Event["owner"] }).owner;
    }
    return next;
  });
}
