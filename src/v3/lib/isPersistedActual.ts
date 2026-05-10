/**
 * Whether `eventId` already has a corresponding entry in the given list
 * of "real" events. Used by drawer save/delete handlers across pages
 * (Dashboard, Timeline, Tomorrow) to route create vs update without
 * relying on lifecycle state alone.
 *
 * The list semantics differ per consumer:
 *  - Dashboard / Timeline: `actuals` (Firestore-backed events). A
 *    projected event (id starts `proj-`) is absent → save creates a
 *    new doc with a fresh id; an overridden / recorded event
 *    (id starts `manual-`) is present → save updates in place.
 *  - Tomorrow: `extras` (in-memory buffer to be persisted on promote).
 *    Same membership question, different storage.
 *
 * Single source of truth so onSave and onDelete handlers can't drift.
 */

import type { Event } from "../schemas";

export function isPersistedActual(eventId: string, list: ReadonlyArray<Event>): boolean {
  return list.some((e) => e.id === eventId);
}
