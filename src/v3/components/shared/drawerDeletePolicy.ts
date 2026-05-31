/** Drawer destructive-action policy (delete / reset / none), extracted for testability. */

import type { Event } from "../../schemas";
import { isRecorded } from "../../schemas";
import { isDreamFeed, isEngineEmittedId, recordedIdFor } from "../../lib/eventConventions";

/** True when the destructive action routes to a per-day suppression rather than a Firestore delete. */
export function hasSuppressionDelete(event: Event): boolean {
  return (
    event.type === "daily_recurring" ||
    event.type === "daycare_dropoff" ||
    event.type === "daycare_pickup" ||
    (event.type === "bottle" && isDreamFeed(event))
  );
}

/**
 * What the drawer's destructive button does for this event:
 *
 * - `"reset"` — a recorded rhythm slot (nap/bottle) reverts to the cascade
 *   projection. Deleting its `recorded_*` doc lets the engine re-project the
 *   slot, so the user isn't *deleting* anything — they're undoing an anchor.
 * - `"delete"` — a real doc the user genuinely wants gone: a FAB-created
 *   one-off (uuid id), pump, extra, bedtime, or a suppression-type skip.
 * - `"none"` — nothing to act on: create mode, no handler, or an
 *   engine-emitted (`proj_*`) event that has no Firestore doc at all
 *   (auto-promoted naps/bottles/bedtime AND wake_windows — §F70: a no-op
 *   button must not appear).
 */
export type DrawerDestructiveAction = "delete" | "reset" | "none";

export function drawerDestructiveAction(
  event: Event,
  opts: { mode: "edit" | "create"; hasOnDelete: boolean },
): DrawerDestructiveAction {
  if (opts.mode !== "edit" || !opts.hasOnDelete) return "none";
  // Suppression types skip-for-the-day rather than delete a doc — valid even while
  // projected (proj_ id), so this must precede the engine-emitted short-circuit.
  if (hasSuppressionDelete(event)) return "delete";
  // Engine-emitted ids have no persisted doc — acting would be a visual no-op.
  if (isEngineEmittedId(event.id)) return "none";
  if (!isRecorded(event.lifecycle)) return "none";
  // A recorded rhythm slot uses the deterministic `recorded_<eventKey>` doc id;
  // deleting it re-projects the slot, so the action is a reset, not a delete.
  // (§F71 — naps + bottles only; bedtime/extra/pump and uuid-id one-offs delete.)
  const isRhythmSlot =
    (event.type === "nap" || event.type === "bottle") && event.id === recordedIdFor(event.eventKey);
  return isRhythmSlot ? "reset" : "delete";
}

/** True when the drawer should render a destructive affordance (delete OR reset). */
export function canDeleteEvent(
  event: Event,
  opts: { mode: "edit" | "create"; hasOnDelete: boolean },
): boolean {
  return drawerDestructiveAction(event, opts) !== "none";
}
