import type { Event } from "./types";

/**
 * Replace a projected wake_window with a manual/actual override of the same
 * eventKey. The user-edited wake_window is the source of truth — owner,
 * label, time changes all flow through this swap. Mirrors how
 * applyNapActuals merges nap actuals, but for wake windows.
 */
export function applyWakeWindowOverrides(events: Event[], actuals: Event[]): Event[] {
  const overrides = new Map<string, Event>();
  for (const a of actuals) {
    if (a.type !== "wake_window") continue;
    if (a.source !== "manual" && a.source !== "actual") continue;
    overrides.set(a.eventKey, a);
  }
  if (overrides.size === 0) return events;
  return events.map((e) => {
    if (e.type !== "wake_window") return e;
    return overrides.get(e.eventKey) ?? e;
  });
}
