/**
 * Render-synthetic putdown marker shared by engine and component layers.
 * Putdown blocks are generated at render time by `expandPutdownBlocks`, never persisted.
 */

import type { Event } from "../schemas";

/** Marker written into `eventKey` of every synthetic putdown block. */
export const PUTDOWN_KIND_TAG = "__putdown__";

/** True when `e` is a render-synthetic putdown chip; engine selectors and stats helpers should skip these. */
export function isRenderSynthetic(e: Event): boolean {
  return e.eventKey === PUTDOWN_KIND_TAG;
}
