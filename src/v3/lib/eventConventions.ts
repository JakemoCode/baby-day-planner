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

/**
 * Durable doc id for a recorded bottle, keyed off its (post-promotion, fixed)
 * startTime — mirrors the projected `proj_bottle_t<startTime>` id. ADR-0007:
 * the bottle `eventKey` (`bottle_N`) renumbers and diverges across unsynced
 * clients, so deriving a doc id from it orphaned docs (the zombie). startTime is
 * client-deterministic, so concurrent auto-promotes of the same feed converge.
 */
export function recordedBottleIdFor(startTime: number): string {
  return `recorded_bottle_t${startTime}`;
}

/**
 * The deterministic recorded doc id for an event by create-mode (ADR-0007):
 * renumberable bottles key off startTime; naps/bedtime (and the fixed-slot
 * dream-feed) keep `recorded_<eventKey>` because their keys don't renumber.
 */
export function recordedIdForEvent(event: {
  type: string;
  eventKey: string;
  startTime: number;
}): string {
  if (event.type === "bottle" && event.eventKey !== DREAM_FEED_EVENT_KEY) {
    return recordedBottleIdFor(event.startTime);
  }
  return recordedIdFor(event.eventKey);
}

/**
 * Key for a per-day owner override (`Day.ownerOverrides`). Bottles key off
 * **chronological position** (`bottle_pos_N`, from the R5.4 label) because their
 * `eventKey` slot renumbers and diverges across clients under the full-day
 * cascade (§F66); naps/wake/bedtime keep their position-stable `eventKey`.
 * Position-keyed overrides follow "the Nth bottle of the day", matching how
 * template `bottleOwners` map in R12.6.
 */
const BOTTLE_POSITION_LABEL = /^Bottle (\d+)$/;
export function ownerOverrideKeyFor(event: {
  type: string;
  eventKey: string;
  label: string;
}): string {
  if (event.type === "bottle" && event.eventKey !== DREAM_FEED_EVENT_KEY) {
    const match = BOTTLE_POSITION_LABEL.exec(event.label);
    if (match) return `bottle_pos_${match[1]}`;
  }
  return event.eventKey;
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
