/**
 * Lifecycle state-machine reducer.
 *
 * Source: docs/v3/DATA_MODEL.md §2.
 *
 * State transitions:
 *
 *                projected
 *                    │
 *      ┌─────────────┼──────────────────┬───────────────┐
 *      │ Record inst │ Time-edit         │ Owner-only    │ DRAWER_SAVE (sched type)
 *      ▼             ▼                  ▼               ▼
 *   completed      completed          completed       recorded ──Time-edit──→ completed
 *
 * - `recorded` = user anchored at least one timestamp (blocks in-progress or
 *   scheduling annotations). For non-scheduling types, recorded → completed on
 *   any time-edit.
 * - `completed` = both start AND end are user-anchored. Once completed, frozen.
 * - Instants jump projected → completed directly.
 */

import type { EventKind, EventType, Lifecycle, TimeMin } from "./schemas";

/**
 * Event types for which drawer time-edits are scheduling intent, not
 * recordings of reality.
 *
 * - `nap` / `bedtime`: action buttons own the flow; the drawer is scheduling.
 * - `daily_recurring`: no action buttons; a drawer time-edit is a one-day reschedule.
 *
 * This is the single authoritative predicate — import from here rather
 * than duplicating the list. (DATA_MODEL.md §2)
 */
export function isSchedulingType(type: EventType): boolean {
  return type === "nap" || type === "bedtime" || type === "daily_recurring";
}

export type LifecycleAction =
  | { type: "RECORD_INSTANT"; at: TimeMin; eventKind: EventKind }
  | { type: "TIME_EDIT"; at: TimeMin }
  | { type: "OWNER_EDIT"; at: TimeMin }
  | {
      type: "DRAWER_SAVE";
      eventType: EventType;
      eventKind: EventKind;
      timeChanged: boolean;
      hasEndTime: boolean;
      nowMinutes: TimeMin;
    };

export class LifecycleTransitionError extends Error {
  readonly fromState: Lifecycle["state"];
  readonly action: LifecycleAction["type"];

  constructor(from: Lifecycle["state"], action: LifecycleAction["type"], reason: string) {
    super(`Invalid lifecycle transition from ${from} via ${action}: ${reason}`);
    this.name = "LifecycleTransitionError";
    this.fromState = from;
    this.action = action;
  }
}

/**
 * Apply a transition. Throws on invalid transitions rather than silently
 * coercing — this is the §0 data-integrity boundary, not a user-facing rule.
 */
export function reduceLifecycle(current: Lifecycle, action: LifecycleAction): Lifecycle {
  switch (action.type) {
    case "RECORD_INSTANT": {
      if (action.eventKind !== "instant") {
        throw new LifecycleTransitionError(
          current.state,
          action.type,
          `RECORD_INSTANT is instant-only (got kind=${action.eventKind})`,
        );
      }
      if (current.state !== "projected") {
        throw new LifecycleTransitionError(
          current.state,
          action.type,
          "RECORD_INSTANT requires projected state",
        );
      }
      return { state: "completed", committedAt: action.at };
    }

    case "TIME_EDIT": {
      return { state: "completed", committedAt: action.at };
    }

    case "OWNER_EDIT": {
      if (current.state !== "projected") {
        // Owner edits on already-recorded or completed events stay in their current state.
        return current;
      }
      return { state: "recorded", annotatedAt: action.at };
    }

    case "DRAWER_SAVE": {
      const { eventType, eventKind, timeChanged, hasEndTime, nowMinutes } = action;

      // Completed stays frozen.
      if (current.state === "completed") {
        return current;
      }

      if (current.state === "projected") {
        if (!timeChanged) {
          // No time change: owner/amount/label only → annotate as recorded.
          return { state: "recorded", annotatedAt: nowMinutes };
        }
        // Block with no endTime is "started but not done yet" — recorded.
        if (eventKind === "block" && !hasEndTime) {
          return { state: "recorded", annotatedAt: nowMinutes };
        }
        // Scheduling types: drawer time-edits are scheduling intent, not
        // reality. Stay in `recorded` so the engine treats the event as
        // a future projection with an anchored time (preserves hasPutdown).
        if (isSchedulingType(eventType)) {
          return { state: "recorded", annotatedAt: nowMinutes };
        }
        // All other types: time-edit locks in the time.
        return { state: "completed", committedAt: nowMinutes };
      }

      // current.state === "recorded"
      // No time change: field edit only → lifecycle unchanged.
      if (!timeChanged) return current;
      // Re-scheduling a scheduling-type stays recorded.
      if (isSchedulingType(eventType)) {
        return { state: "recorded", annotatedAt: nowMinutes };
      }
      // Other recorded + time-edit: promote to completed.
      return { state: "completed", committedAt: nowMinutes };
    }
  }
}
