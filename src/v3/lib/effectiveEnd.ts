/**
 * Render-layer helpers for in-progress nap end time.
 *
 * A recorded nap with no endTime auto-extends by napLen per window, capped at 3 extensions (4×napLen).
 * NOT used by the cascade cursor — auto-extend is render-only.
 */

import type { Event, Settings, TimeMin } from "../schemas";

/** Minimal Settings slice; accepts a full Settings or a plain object literal — no casting needed at call sites. */
export type EffectiveEndConfig = Pick<Settings, "defaultNapLengthMinutes">;

/**
 * True when a recorded event has started but not yet reached its resolved end.
 * Callers must pre-filter by event type; this checks timing and lifecycle only.
 */
export function isInProgress(e: Event, config: EffectiveEndConfig, now: TimeMin): boolean {
  if (e.lifecycle.state !== "recorded") return false;
  if (e.startTime > now) return false;
  return now < resolvedEnd(e, config, now);
}

export function resolvedEnd(event: Event, config: EffectiveEndConfig, now: TimeMin): TimeMin {
  const napLen = config.defaultNapLengthMinutes;
  const { lifecycle, startTime, endTime } = event;

  // Projected / completed: pass through committed endTime.
  if (lifecycle.state !== "recorded") {
    return endTime ?? startTime;
  }

  // Recorded WITH endTime: drawer-committed, no auto-extend.
  // Recorded WITHOUT endTime: "Start Nap Now" path; placeholder grows until user taps End.
  if (endTime !== undefined) {
    return endTime;
  }

  const baseEnd = startTime + napLen;
  if (now <= baseEnd) return baseEnd;
  const extensions = Math.min(3, Math.floor((now - baseEnd) / napLen) + 1);
  return baseEnd + extensions * napLen;
}
