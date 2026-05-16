/**
 * renderProjection — the named seam between engine output and the screen.
 *
 * Two post-projection render passes are composed here in order:
 *
 * 1. Dream-feed label (DOMAIN.md §5): when dream feed is enabled, the first
 *    post-bedtime bottle gets relabeled "Dream Feed". Operates on bottles;
 *    must run BEFORE putdown expansion so the relabeled bottle is stable.
 *
 * 2. Putdown expansion (RENDER_SPEC R6.x): naps/bedtimes with `hasPutdown: true`
 *    get a synthetic render-only block prepended. `putdownLeadMinutes` is read
 *    from `settings` so callers only need to pass `(events, settings, nowMinutes?)`.
 *
 * Any future render-only pass (e.g. history overlays, export formatting) belongs
 * here — not scattered across hooks or components.
 */

import type { Event, Settings, TimeMin } from "../schemas";
import { applyDreamFeedLabel } from "./dreamFeedLabel";
import { expandPutdownBlocks } from "../components/Timeline/expandPutdown";

export function renderProjection(
  events: Event[],
  settings: Settings,
  nowMinutes?: TimeMin,
): Event[] {
  // Pass 1: dream-feed label (operates on bottles, no structural changes).
  const labeled = applyDreamFeedLabel(events, settings);
  // Pass 2: putdown expansion (synthesizes new render-only chips around naps/bedtimes).
  // defaultNapLengthMinutes is used as the soft-end fallback when an in-progress
  // sleep block has no explicit endTime yet (R6.8).
  return expandPutdownBlocks(labeled, {
    putdownLeadMinutes: settings.putdownLeadMinutes,
    defaultNapLengthMinutes: settings.defaultNapLengthMinutes,
    ...(nowMinutes !== undefined ? { nowMinutes } : {}),
  });
}
