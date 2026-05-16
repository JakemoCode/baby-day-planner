/**
 * Lifecycle state-machine reducer.
 *
 * Source: docs/v3/ARCHITECTURE_V3.md §4, REQUIREMENTS.md §2.
 *
 * State transitions:
 *
 *                projected
 *                    │
 *      ┌─────────────┼──────────────────┬───────────────┐
 *      │ Start       │ Record (instant) │ Time-edit     │ Owner-only edit
 *      ▼             ▼                  ▼               ▼
 *   started ──End──→ completed ←──Time-edit── overridden ──Time-edit──→ completed
 *
 * - `started` is reachable ONLY for block-kind events (nap, bedtime, durational
 *   extras / daily_recurring). Instants jump projected → completed.
 * - `overridden` ⇒ user assigned an owner on a still-future projection;
 *   subsequent time-edit promotes to completed.
 * - Once `completed`, never returns to `projected`.
 */

import type { EventKind, EventType, Lifecycle, TimeMin } from "./schemas";

/**
 * Event types for which drawer time-edits are scheduling intent, not
 * recordings of reality.
 *
 * - `nap` / `bedtime`: Start/End action buttons own the
 *   projected → started → completed flow; the drawer is scheduling.
 * - `daily_recurring`: recurring entries have no action buttons; a
 *   drawer time-edit is a one-day reschedule, not a recording.
 *
 * This is the single authoritative predicate — import from here rather
 * than duplicating the list. (ARCHITECTURE_V3 §4)
 */
export function isSchedulingType(type: EventType): boolean {
  return type === "nap" || type === "bedtime" || type === "daily_recurring";
}

export type LifecycleAction =
  | { type: "START"; at: TimeMin; eventKind: EventKind }
  | { type: "END"; at: TimeMin }
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
    case "START": {
      if (action.eventKind !== "block") {
        throw new LifecycleTransitionError(
          current.state,
          action.type,
          `START is block-only; instants must use RECORD_INSTANT (got kind=${action.eventKind})`,
        );
      }
      if (current.state !== "projected") {
        throw new LifecycleTransitionError(
          current.state,
          action.type,
          "START requires projected state",
        );
      }
      return { state: "started", committedAt: action.at };
    }

    case "END": {
      if (current.state !== "started") {
        throw new LifecycleTransitionError(
          current.state,
          action.type,
          "END requires started state",
        );
      }
      return { state: "completed", committedAt: current.committedAt };
    }

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
      if (current.state === "started") {
        throw new LifecycleTransitionError(
          current.state,
          action.type,
          "use END to set the end time of a started block, not TIME_EDIT",
        );
      }
      return { state: "completed", committedAt: action.at };
    }

    case "OWNER_EDIT": {
      if (current.state !== "projected") {
        // Owner edits on already-recorded events stay in their current state.
        // Only a projected event transitions to overridden.
        return current;
      }
      return { state: "overridden", annotatedAt: action.at };
    }

    case "DRAWER_SAVE": {
      const { eventType, eventKind, timeChanged, hasEndTime, nowMinutes } = action;

      // Already-recorded states (started / completed) stay as-is.
      // Field edits (owner, amount, label) may apply but lifecycle is frozen.
      if (current.state === "started" || current.state === "completed") {
        return current;
      }

      if (current.state === "projected") {
        if (!timeChanged) {
          // No time change: owner/amount/label only → annotate as overridden.
          return { state: "overridden", annotatedAt: nowMinutes };
        }
        // Block with no endTime is "started but not done yet."
        if (eventKind === "block" && !hasEndTime) {
          return { state: "started", committedAt: nowMinutes };
        }
        // Scheduling types: drawer time-edits are scheduling intent, not
        // reality. Stay in `overridden` so the engine treats the event as
        // a future projection (preserves hasPutdown).
        if (isSchedulingType(eventType)) {
          return { state: "overridden", annotatedAt: nowMinutes };
        }
        // All other types: time-edit locks in the time.
        return { state: "completed", committedAt: nowMinutes };
      }

      // current.state === "overridden"
      if (timeChanged) {
        // Re-scheduling a scheduling-type stays overridden.
        if (isSchedulingType(eventType)) {
          return { state: "overridden", annotatedAt: nowMinutes };
        }
        // Other overridden + time-edit: promote to completed.
        return { state: "completed", committedAt: nowMinutes };
      }

      // overridden + no time change: field edit only → lifecycle unchanged.
      return current;
    }
  }
}
