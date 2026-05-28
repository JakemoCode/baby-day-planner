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
 * §F66 future-event drawer rule (ADR-0001 + CONTEXT.md "future-event
 * drawer rule"): the time/amount inputs on the drawer are locked only
 * for rhythm-cascade events (`nap`, non-dream-feed `bottle`) that are
 * strictly in the future. Daycare, daily-recurring, dream-feed, and
 * `extra` events are fixed-time / explicit-slot — the user can move
 * them per-day without breaking the cascade.
 *
 * Conditions:
 *   - lifecycle is `projected`
 *   - `startTime > nowMinutes`
 *   - type is `nap` or `bottle` (the cascade-anchoring types)
 *   - NOT the dream-feed slot (`bottle_dream`) — that's explicit-
 *     schedule, not rhythm-cascade
 *   - NOT a render-synthetic putdown chip (these inherit type="nap"
 *     and the parent's projected lifecycle for timeline geometry;
 *     without the filter they'd claim the next-nap slot in
 *     {@link isNextProjectedOfType} via their earlier startTime and
 *     lock the real nap's drawer inputs)
 *
 * **Pure-event predicate**: does NOT know whether this event is the
 * chronologically-next of its type. The drawer combines this with
 * {@link isNextProjectedOfType} to allow per-day anchoring of the next
 * nap or bottle (sick-day flexibility, §F66 fast-follow C2):
 *   `lockTimeInputs = isFutureProjected(e, now) && !isNextProjectedOfType(e, allEvents, now)`
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
 * True iff `event` is the chronologically-earliest projected event of
 * its type whose `startTime > nowMinutes`. The drawer exempts these
 * from the time-lock so the user can anchor the next-up nap or bottle
 * to baby's actual rhythm (sick day, off-schedule day). Farther-out
 * events stay locked — once the user pins the next slot, the cascade
 * re-anchors and reprojects everything beyond it from that point.
 *
 * Dream-feed (`bottle_dream`) is not counted as the next bottle — it's
 * a separate schedule-time slot, not part of the rhythm chain.
 *
 * Established 2026-05-27 in §F66 fast-follow C2.
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
