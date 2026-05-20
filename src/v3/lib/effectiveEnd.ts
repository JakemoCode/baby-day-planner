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

  // Projected / completed: render to the committed extent. Completed naps
  // have endTime; projected naps' cascade-derived endTime is present too.
  if (lifecycle.state !== "recorded") {
    return endTime ?? startTime;
  }

  // Recorded WITH endTime → user has committed both timestamps via the
  // drawer (which always sets endTime). No auto-extend; render to the
  // chosen extent.
  //
  // Recorded WITHOUT endTime → "Start Nap Now, waiting for End Nap." The
  // placeholder `startTime + napLen` extends as time passes (capped at
  // 3 extensions = 4×napLen total) so the rendered block continues to
  // grow visually until the user taps End or edits via the drawer.
  //
  // The "no endTime" signal is owned by NapActionButton.Start (no endTime
  // on creation) vs. EventEditDrawerV3.handleSave (always writes endTime
  // because the form has start AND end fields).
  if (endTime !== undefined) {
    return endTime;
  }

  const baseEnd = startTime + napLen;
  if (now <= baseEnd) return baseEnd;
  const extensions = Math.min(3, Math.floor((now - baseEnd) / napLen) + 1);
  return baseEnd + extensions * napLen;
}
