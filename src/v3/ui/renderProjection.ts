/**
 * renderProjection — the named seam between engine output and the screen.
 *
 * Three post-projection render passes are composed here in order:
 *
 * 1. Dream-feed label (DOMAIN.md §5): when dream feed is enabled, the first
 *    post-bedtime bottle gets relabeled "Dream Feed". Operates on bottles;
 *    must run BEFORE putdown expansion so the relabeled bottle is stable.
 *
 * 2. Resolved-end bake-in: for in-progress recorded naps/bedtimes (lifecycle
 *    state "recorded", now > endTime), rewrite endTime to resolvedEnd(...)
 *    so the renderer draws the block to its auto-extended end. The cascade
 *    cursor in naps.ts deliberately does NOT use resolvedEnd — past naps
 *    shouldn't stretch future wake-windows — so this rewrite is render-only.
 *    No effect when nowMinutes is undefined (archived-day path).
 *
 * 3. Putdown expansion (RENDER_SPEC R6.x): naps/bedtimes with `hasPutdown: true`
 *    get a synthetic render-only block prepended. `putdownLeadMinutes` is read
 *    from `settings` so callers only need to pass `(events, settings, nowMinutes?)`.
 *
 * Any future render-only pass (e.g. history overlays, export formatting) belongs
 * here — not scattered across hooks or components.
 */

import type { Event, Settings, TimeMin } from "../schemas";
import { resolvedEnd } from "../lib/effectiveEnd";
import { applyDreamFeedLabel } from "./dreamFeedLabel";
import { expandPutdownBlocks } from "../components/Timeline/expandPutdown";

export function renderProjection(
  events: Event[],
  settings: Settings,
  nowMinutes?: TimeMin,
): Event[] {
  // Pass 1: dream-feed label (operates on bottles, no structural changes).
  const labeled = applyDreamFeedLabel(events, settings);
  // Pass 2: bake resolvedEnd into in-progress recorded sleeps so the
  // renderer draws them to their auto-extended end. resolvedEnd only
  // extends recorded events whose endTime < now; everything else passes
  // through unchanged.
  const withResolvedEnds =
    nowMinutes === undefined
      ? labeled
      : labeled.map((e) => {
          if (e.lifecycle.state !== "recorded") return e;
          if (e.type !== "nap" && e.type !== "bedtime") return e;
          // Don't early-return when endTime is undefined — that's the
          // "Start Nap Now, in progress" shape and resolvedEnd is
          // exactly the function that supplies the right rendered end
          // (placeholder + auto-extension up to the cap).
          const ext = resolvedEnd(e, settings, nowMinutes);
          return ext === e.endTime ? e : { ...e, endTime: ext };
        });
  // Pass 3: putdown expansion (synthesizes new render-only chips around naps/bedtimes).
  // defaultNapLengthMinutes is used as the soft-end fallback when an in-progress
  // sleep block has no explicit endTime yet (R6.8).
  return expandPutdownBlocks(withResolvedEnds, {
    putdownLeadMinutes: settings.putdownLeadMinutes,
    defaultNapLengthMinutes: settings.defaultNapLengthMinutes,
    ...(nowMinutes !== undefined ? { nowMinutes } : {}),
  });
}
