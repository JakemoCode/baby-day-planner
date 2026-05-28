/**
 * Shared helpers for V3 rules.
 *
 * Goal: keep rule files focused on *intent* (match conditions, transformations)
 * by hoisting the repeated event-literal construction and predicate plumbing
 * into one place. Each rule still owns its domain logic; helpers only express
 * the mechanics.
 */

import type { Context, Event, EventKind, EventType, OwnerRef } from "../schemas";
import { isRecorded, NO_OWNER } from "../schemas";

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

/** True when the event is in the `projected` lifecycle state. */
export function isProjected(event: Event): boolean {
  return event.lifecycle.state === "projected";
}

/** True when the event is a recording of reality (started or completed). */
export function isRecordedEvent(event: Event): boolean {
  return isRecorded(event.lifecycle);
}

/** Pre-bound type predicate factory: `events.some(hasType("bottle"))`. */
export function hasType(type: EventType): (event: Event) => boolean {
  return (event) => event.type === type;
}

/**
 * Pre-bound type predicates for the types that appear in two or more rule
 * files. Single-use predicates (e.g. `isPump`, `isRecurring`) stay local to
 * their rule file — consolidation only helps when there's actual duplication.
 */
export const isNap = hasType("nap");
export const isWakeWindow = hasType("wake_window");
export const isBedtime = hasType("bedtime");
export const isBottle = hasType("bottle");

// ---------------------------------------------------------------------------
// Event construction
// ---------------------------------------------------------------------------

export type ProjectedEventInput = {
  ctx: Pick<Context, "day">;
  id: string;
  eventKey: string;
  type: EventType;
  kind: EventKind;
  startTime: number;
  label: string;
  endTime?: number;
  amountOz?: number;
  owner?: OwnerRef;
  hasPutdown?: boolean;
};

/**
 * Build a `projected` Event with the boilerplate filled in. Optional fields
 * are only set when defined to honor `exactOptionalPropertyTypes`.
 */
export function projectedEvent(input: ProjectedEventInput): Event {
  const event: Event = {
    id: input.id,
    dayId: input.ctx.day.id,
    eventKey: input.eventKey,
    type: input.type,
    kind: input.kind,
    startTime: input.startTime,
    label: input.label,
    hasPutdown: input.hasPutdown ?? false,
    owner: input.owner ?? NO_OWNER, // §F37: owner is required; default to unassigned
    lifecycle: { state: "projected" },
  };
  if (input.endTime !== undefined) event.endTime = input.endTime;
  if (input.amountOz !== undefined) event.amountOz = input.amountOz;
  return event;
}
