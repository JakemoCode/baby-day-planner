/**
 * Canonical home for the render-synthetic putdown marker.
 *
 * The engine never persists putdown events. Putdown blocks are generated
 * at render time by `expandPutdownBlocks` and are tagged with
 * `PUTDOWN_KIND_TAG` so callers can distinguish them from real engine
 * events without sniffing types.
 *
 * Both the engine layer (selectors.ts) and the component layer
 * (dashboardStats.ts) need to skip synthetic events. Centralising the
 * constant and the predicate here fixes the inverted coupling direction
 * that previously had the domain layer importing from a component module.
 */

import type { Event } from "../schemas";

/** Marker written into `eventKey` of every synthetic putdown block. */
export const PUTDOWN_KIND_TAG = "__putdown__";

/**
 * Returns true when `e` is a render-synthetic event (i.e. a putdown chip
 * injected by `expandPutdownBlocks`). Engine selectors and stats helpers
 * should skip events that match this predicate.
 */
export function isRenderSynthetic(e: Event): boolean {
  return e.eventKey === PUTDOWN_KIND_TAG;
}
