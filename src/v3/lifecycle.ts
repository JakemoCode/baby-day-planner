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

import type { Event, EventKind, EventType, Lifecycle, TimeMin } from "./schemas";
import { isRenderSynthetic } from "./lib/syntheticEvents";
import { isDreamFeed } from "./lib/eventConventions";

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

/**
 * ADR-0001: true for projected rhythm-cascade events (nap, non-dream-feed bottle)
 * whose startTime is strictly after nowMinutes. Excludes dream-feed (`bottle_dream` —
 * explicit-schedule, not cascade) and render-synthetic putdowns (inherit type="nap" but
 * aren't real nap slots — without this filter they'd win the "earliest projected nap"
 * lottery and lock the real nap's drawer inputs).
 *
 * Pure-event predicate — combine with {@link isNextProjectedOfType} for the drawer lock:
 * `lockTimeInputs = isFutureProjected(e, now) && !isNextProjectedOfType(e, allEvents, now)`
 */
export function isFutureProjected(event: Event, nowMinutes: TimeMin): boolean {
  if (event.lifecycle.state !== "projected") return false;
  if (event.startTime <= nowMinutes) return false;
  if (event.type !== "nap" && event.type !== "bottle") return false;
  if (event.type === "bottle" && isDreamFeed(event)) return false;
  if (isRenderSynthetic(event)) return false;
  return true;
}

/**
 * True iff `event` is the chronologically-earliest projected event of its type with
 * `startTime > nowMinutes`. The drawer exempts these so the user can anchor the next-up
 * nap/bottle to baby's actual rhythm (sick day, off-schedule). Dream-feed is excluded —
 * it's an explicit-schedule slot, not part of the rhythm chain.
 */
export function isNextProjectedOfType(
  event: Event,
  allEvents: Event[],
  nowMinutes: TimeMin,
): boolean {
  if (!isFutureProjected(event, nowMinutes)) return false;
  let earliest: Event | undefined;
  for (const e of allEvents) {
    if (e.type !== event.type) continue;
    if (!isFutureProjected(e, nowMinutes)) continue;
    if (earliest === undefined || e.startTime < earliest.startTime) earliest = e;
  }
  return earliest !== undefined && earliest.id === event.id;
}

// ---------------------------------------------------------------------------
// Legacy lifecycle migration
// ---------------------------------------------------------------------------

/**
 * Migrates pre-PR-#166 Firestore lifecycle shapes to the current vocabulary.
 *
 * "started" + "overridden" both meant "user-anchored event"; the post-#166
 * vocabulary collapses them into "recorded". `committedAt` (from started)
 * becomes the new `annotatedAt` since both mark the moment the user touched
 * the event.
 *
 * Returns `null` when no migration is needed (lifecycle is already valid or
 * unrecognized).
 */
export function migrateLegacyLifecycle(
  lifecycle: unknown,
  fallbackTime: TimeMin,
): Lifecycle | null {
  if (!lifecycle || typeof lifecycle !== "object") return null;
  const state = (lifecycle as { state?: unknown }).state;
  if (state === "started") {
    const committedAt = (lifecycle as { committedAt?: unknown }).committedAt;
    return {
      state: "recorded",
      annotatedAt: typeof committedAt === "number" ? committedAt : fallbackTime,
    };
  }
  if (state === "overridden") {
    const annotatedAt = (lifecycle as { annotatedAt?: unknown }).annotatedAt;
    return {
      state: "recorded",
      annotatedAt: typeof annotatedAt === "number" ? annotatedAt : fallbackTime,
    };
  }
  return null;
}

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
      /** "create" = FAB-created new event; "edit" / omitted = annotating an existing projection. */
      mode?: "create" | "edit";
      /** The event's startTime, needed in create mode to decide
       * committed-reality (now-or-past) vs scheduled-future. */
      startTime?: TimeMin;
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
      const { eventType, eventKind, timeChanged, hasEndTime, nowMinutes, mode, startTime } = action;

      // Completed stays frozen.
      if (current.state === "completed") {
        return current;
      }

      if (current.state === "projected") {
        // Create mode: brand-new event from the FAB (not an annotation of an existing projection).
        // now-or-past → completed (committed reality, deletable); future → recorded (scheduled).
        // Scheduling types and open blocks fall through to recorded handling below.
        if (
          mode === "create" &&
          startTime !== undefined &&
          !isSchedulingType(eventType) &&
          !(eventKind === "block" && !hasEndTime)
        ) {
          return startTime <= nowMinutes
            ? { state: "completed", committedAt: nowMinutes }
            : { state: "recorded", annotatedAt: nowMinutes };
        }
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
