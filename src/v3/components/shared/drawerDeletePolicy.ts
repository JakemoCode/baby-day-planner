/** Drawer Delete-button visibility policy, extracted for testability. */

import type { Event } from "../../schemas";
import { isRecorded } from "../../schemas";
import { isDreamFeed, isEngineEmittedId } from "../../lib/eventConventions";

/** True when Delete should route to a per-day suppression rather than a Firestore delete. */
export function hasSuppressionDelete(event: Event): boolean {
  return (
    event.type === "daily_recurring" ||
    event.type === "daycare_dropoff" ||
    event.type === "daycare_pickup" ||
    (event.type === "bottle" && isDreamFeed(event))
  );
}

/** Auto-promoted sleep event (Now-cross): engine-only, no Firestore doc. Delete is a no-op. */
export function isAutoPromotedSleep(event: Event): boolean {
  return (event.type === "nap" || event.type === "bedtime") && isEngineEmittedId(event.id);
}

/**
 * Auto-promoted bottle: has a real Firestore doc but cascade re-emits it, so Delete is visible no-op.
 * Signature: lifecycle "recorded" with annotatedAt === startTime (manual logs use "completed").
 */
export function isAutoPromotedBottleEvent(event: Event): boolean {
  return (
    event.type === "bottle" &&
    !isDreamFeed(event) &&
    event.lifecycle.state === "recorded" &&
    event.lifecycle.annotatedAt === event.startTime
  );
}

/** True when the drawer should render a Delete affordance for this event. */
export function canDeleteEvent(
  event: Event,
  opts: { mode: "edit" | "create"; hasOnDelete: boolean },
): boolean {
  if (opts.mode !== "edit" || !opts.hasOnDelete) return false;
  if (isAutoPromotedSleep(event) || isAutoPromotedBottleEvent(event)) return false;
  return isRecorded(event.lifecycle) || hasSuppressionDelete(event);
}
