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
 * Used by:
 *   - cascade cursor advancement (naps.ts)
 *   - inProgressNap selector (page.tsx)
 *   - putdown overlap gate (expandPutdown.ts)
 *   - timeline renderer end computation
 *
 * Only extends for `lifecycle.state === "recorded"`. All other states
 * (projected, completed) pass through `event.endTime ?? event.startTime`.
 */

import type { Event, TimeMin } from "../schemas";

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
