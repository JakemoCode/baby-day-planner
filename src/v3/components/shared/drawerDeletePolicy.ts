/**
 * Drawer Delete-button visibility policy.
 *
 * Extracted from EventEditDrawerV3's render body so the decision —
 * "should the drawer show a Delete affordance for this event?" — is a
 * pure function that can be unit-tested without mounting the drawer.
 * The logic is subtle (auto-promoted events look recorded but deleting
 * them is a visual no-op because the cascade re-emits them next pass),
 * so it earns a dedicated test surface.
 */

import type { Event } from "../../schemas";
import { isRecorded } from "../../schemas";
import { isDreamFeed, isEngineEmittedId } from "../../lib/eventConventions";

/**
 * True when a drawer Delete should route to a per-day suppression write
 * rather than a true Firestore delete. These events have no deletable
 * `actuals` doc when projected — "delete" means "skip for today":
 *   - daily_recurring → Day.suppressedRecurringIds (§F65)
 *   - daycare_dropoff / daycare_pickup → Day.suppressedDaycareDay (§F66)
 *   - dream-feed slot → Day.suppressedDreamFeed (§F66)
 */
export function hasSuppressionDelete(event: Event): boolean {
  return (
    event.type === "daily_recurring" ||
    event.type === "daycare_dropoff" ||
    event.type === "daycare_pickup" ||
    (event.type === "bottle" && isDreamFeed(event))
  );
}

/**
 * Auto-promoted nap/bedtime: a projected sleep event whose time passed,
 * flipped to recorded by the engine's Now-cross promotion (ADR-0001).
 * It lives only in engine output — no Firestore doc — so its id still
 * carries the engine `proj_` prefix. Deleting it is a no-op: the next
 * cascade re-emits it.
 */
export function isAutoPromotedSleep(event: Event): boolean {
  return (event.type === "nap" || event.type === "bedtime") && isEngineEmittedId(event.id);
}

/**
 * Auto-promoted bottle: persisted by useAutoPromotePersistence, so it
 * has a real doc — but the cascade re-emits and the hook re-writes it
 * on the next pass, so Delete would visibly do nothing. Signature:
 * lifecycle "recorded" with annotatedAt === startTime. Manual logs use
 * "completed", and drawer saves bump annotatedAt to nowMinutes, so
 * neither collides with this. Dream-feed is excluded — it has its own
 * suppression path.
 */
export function isAutoPromotedBottleEvent(event: Event): boolean {
  return (
    event.type === "bottle" &&
    !isDreamFeed(event) &&
    event.lifecycle.state === "recorded" &&
    event.lifecycle.annotatedAt === event.startTime
  );
}

/**
 * True when the drawer should render a Delete affordance for this event.
 */
export function canDeleteEvent(
  event: Event,
  opts: { mode: "edit" | "create"; hasOnDelete: boolean },
): boolean {
  if (opts.mode !== "edit" || !opts.hasOnDelete) return false;
  if (isAutoPromotedSleep(event) || isAutoPromotedBottleEvent(event)) return false;
  return isRecorded(event.lifecycle) || hasSuppressionDelete(event);
}
