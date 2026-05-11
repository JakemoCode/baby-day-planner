/**
 * Whether `eventId` is already present in `list`. Used by drawer
 * save/delete handlers to route create vs update.
 */

import type { Event } from "../schemas";

export function isPersistedActual(eventId: string, list: ReadonlyArray<Event>): boolean {
  return list.some((e) => e.id === eventId);
}
