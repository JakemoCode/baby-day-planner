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

/**
 * Grace minutes the "End now" drawer shortcut survives past a nap's projected end.
 * Naps run long unpredictably (DOMAIN §1 — length variance), so the shortcut stays
 * tappable briefly after Now crosses the projected end to record the true, later end.
 */
export const NAP_END_GRACE_MIN: TimeMin = 15;

/**
 * True iff this nap is the one straddling the Now line: it has begun and Now hasn't
 * yet passed its end plus the {@link NAP_END_GRACE_MIN} grace. Naps don't overlap, so
 * at most one nap is active. Drives both drawer "now" shortcuts on an in-progress nap.
 */
export function isActiveNap(event: Event, nowMinutes: TimeMin): boolean {
  if (event.type !== "nap") return false;
  if (isRenderSynthetic(event)) return false;
  if (event.startTime > nowMinutes) return false;
  if (event.endTime === undefined) return true; // open nap: in progress, no end yet
  return nowMinutes < event.endTime + NAP_END_GRACE_MIN;
}

/**
 * The single nap nearest the Now line that earns the drawer "now" shortcuts: the
 * {@link isActiveNap active} one if any exists, otherwise the next-upcoming nap
 * (earliest `startTime > now`). Returns false for every other nap — past naps and
 * naps beyond the next keep manual edit only. Render-synthetic putdowns are excluded.
 *
 * Drives the **Start now** button. **End now** additionally requires {@link isActiveNap}
 * (a not-yet-started focus nap can't be ended).
 */
export function isFocusNap(event: Event, allEvents: Event[], nowMinutes: TimeMin): boolean {
  if (event.type !== "nap" || isRenderSynthetic(event)) return false;
  const naps = allEvents.filter((e) => e.type === "nap" && !isRenderSynthetic(e));
  const active = naps.find((e) => isActiveNap(e, nowMinutes));
  if (active) return active.id === event.id;
  let next: Event | undefined;
  for (const e of naps) {
    if (e.startTime <= nowMinutes) continue;
    if (next === undefined || e.startTime < next.startTime) next = e;
  }
  return next !== undefined && next.id === event.id;
}

/**
 * True iff this is the real bottle closest to Now in either direction (min
 * `|startTime - now|`). Dream-feed (explicit-schedule) and render-synthetic bottles are
 * excluded. Drives the **Log now** shortcut — at most one bottle carries it.
 */
export function isNearestBottle(event: Event, allEvents: Event[], nowMinutes: TimeMin): boolean {
  if (event.type !== "bottle" || isDreamFeed(event) || isRenderSynthetic(event)) return false;
  let nearest: Event | undefined;
  let bestDist = Infinity;
  for (const e of allEvents) {
    if (e.type !== "bottle" || isDreamFeed(e) || isRenderSynthetic(e)) continue;
    const dist = Math.abs(e.startTime - nowMinutes);
    if (dist < bestDist) {
      bestDist = dist;
      nearest = e;
    }
  }
  return nearest !== undefined && nearest.id === event.id;
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

// ---------------------------------------------------------------------------
// Constructors — the single place a Lifecycle value is minted.
// Shape is enforced by the discriminated union (schemas.ts) under strict TS;
// authorship is convention: call these instead of hand-building a
// `{ state: ... }` literal. See CONTEXT.md "realize" + DATA_MODEL.md §2 (§F59).
// ---------------------------------------------------------------------------

export function projectedLifecycle(): Lifecycle {
  return { state: "projected" };
}

export function recordedLifecycle(annotatedAt: TimeMin): Lifecycle {
  return { state: "recorded", annotatedAt };
}

export function completedLifecycle(committedAt: TimeMin): Lifecycle {
  return { state: "completed", committedAt };
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
      return completedLifecycle(action.at);
    }

    case "TIME_EDIT": {
      return completedLifecycle(action.at);
    }

    case "OWNER_EDIT": {
      if (current.state !== "projected") {
        // Owner edits on already-recorded or completed events stay in their current state.
        return current;
      }
      return recordedLifecycle(action.at);
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
            ? completedLifecycle(nowMinutes)
            : recordedLifecycle(nowMinutes);
        }
        if (!timeChanged) {
          // No time change: owner/amount/label only → annotate as recorded.
          return recordedLifecycle(nowMinutes);
        }
        // Block with no endTime is "started but not done yet" — recorded.
        if (eventKind === "block" && !hasEndTime) {
          return recordedLifecycle(nowMinutes);
        }
        // Scheduling types: drawer time-edits are scheduling intent, not
        // reality. Stay in `recorded` so the engine treats the event as
        // a future projection with an anchored time (preserves hasPutdown).
        if (isSchedulingType(eventType)) {
          return recordedLifecycle(nowMinutes);
        }
        // All other types: time-edit locks in the time.
        return completedLifecycle(nowMinutes);
      }

      // current.state === "recorded"
      // No time change: field edit only → lifecycle unchanged.
      if (!timeChanged) return current;
      // Re-scheduling a scheduling-type stays recorded.
      if (isSchedulingType(eventType)) {
        return recordedLifecycle(nowMinutes);
      }
      // Other recorded + time-edit: promote to completed.
      return completedLifecycle(nowMinutes);
    }
  }
}
