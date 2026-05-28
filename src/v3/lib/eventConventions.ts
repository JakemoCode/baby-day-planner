/** Canonical magic strings for event naming shared across engine, drawer, and persistence. */

/** Prefix on engine-emitted projected event ids; replaced by `recorded_*` only on persistence. */
export const ENGINE_PROJECTED_ID_PREFIX = "proj_";

export function isEngineEmittedId(id: string): boolean {
  return id.startsWith(ENGINE_PROJECTED_ID_PREFIX);
}

/** Deterministic Firestore doc id for a recorded event; idempotent re-saves overwrite the same doc. */
export function recordedIdFor(eventKey: string): string {
  return `recorded_${eventKey}`;
}

/** Dream-feed sentinel: type "bottle" but skipped by the cascade (fixed post-bedtime slot, not an anchor). */
export const DREAM_FEED_EVENT_KEY = "bottle_dream";

export function isDreamFeed(e: { eventKey: string }): boolean {
  return e.eventKey === DREAM_FEED_EVENT_KEY;
}

/** Daycare singleton eventKeys; eventKey equals the EventType discriminant. Locked here to prevent drift between the daycare rule and drawer delete-suppression. */
export const DAYCARE_DROPOFF_EVENT_KEY = "daycare_dropoff";
export const DAYCARE_PICKUP_EVENT_KEY = "daycare_pickup";

/** Prefix that marks a cascade projection as coming from a recurring template; stripped by the drawer delete path to write `Day.suppressedRecurringIds`. */
export const RECURRING_KEY_PREFIX = "recurring:";

export function recurringEventKeyFor(id: string): string {
  return `${RECURRING_KEY_PREFIX}${id}`;
}

export function recurringIdFromEventKey(eventKey: string): string {
  return eventKey.startsWith(RECURRING_KEY_PREFIX)
    ? eventKey.slice(RECURRING_KEY_PREFIX.length)
    : eventKey;
}
