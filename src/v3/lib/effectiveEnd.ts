/**
 * Derives the effective end time for an in-progress recorded nap.
 *
 * An in-progress nap (lifecycle.state === "recorded") may run past its
 * placeholder endTime. When `now > event.endTime`, the effective end
 * auto-extends by one napLen per extension window, capped at 3 extensions
 * (= startTime + 4×napLen).
 *
 * When a recorded nap has no endTime (legacy data or edge case), the soft end
 * is `startTime + napLen` — same placeholder the cascade uses.
 *
 * Used by (render-layer only):
 *   - inProgressNap selector (page.tsx) — End Nap button visibility
 *   - putdown overlap gate (expandPutdown.ts) — R6.8
 *   - renderProjection — bakes effective endTime into rendered event
 *
 * NOT used by the cascade cursor in naps.ts: past naps shouldn't stretch
 * future wake-windows, so the cascade advances by the recorded endTime
 * directly. Auto-extend is a render-only concern.
 *
 * Only extends for `lifecycle.state === "recorded"`. All other states
 * (projected, completed) pass through `event.endTime ?? event.startTime`.
 */

import type { Event, TimeMin } from "../schemas";

/**
 * True when an event is currently in its in-progress window:
 * - lifecycle.state === "recorded" (user-anchored but not yet done)
 * - startTime <= now (it has started)
 * - now < effectiveEnd (it hasn't auto-extended past its cap)
 *
 * Callers are responsible for pre-filtering by event type (e.g. nap,
 * bedtime) — this predicate only checks timing and lifecycle.
 *
 * Used by:
 *   - inProgressNap selector (page.tsx) — End Nap button visibility
 *   - expandPutdown.ts — R6.8 in-progress overlap gate
 */
export function isInProgress(e: Event, napLen: number, now: TimeMin): boolean {
  if (e.lifecycle.state !== "recorded") return false;
  if (e.startTime > now) return false;
  return now < effectiveEndOf(e, napLen, now);
}

export function effectiveEndOf(event: Event, napLen: number, now: TimeMin): TimeMin {
  const { lifecycle, startTime, endTime } = event;

  if (lifecycle.state !== "recorded") {
    return endTime ?? startTime;
  }

  // Recorded nap with no endTime: treat as startTime + napLen (same placeholder
  // the cascade uses). This handles legacy data and the rare edge case where
  // NapActionButton didn't set endTime.
  const baseEnd = endTime ?? startTime + napLen;

  if (now <= baseEnd) return baseEnd;

  const extensions = Math.min(3, Math.floor((now - baseEnd) / napLen) + 1);
  return baseEnd + extensions * napLen;
}
