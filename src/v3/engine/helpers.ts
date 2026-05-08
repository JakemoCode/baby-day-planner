/**
 * Shared helpers for V3 rules.
 *
 * Goal: keep rule files focused on *intent* (match conditions, transformations)
 * by hoisting the repeated event-literal construction and predicate plumbing
 * into one place. Each rule still owns its domain logic; helpers only express
 * the mechanics.
 */

import type { Context, Event, EventKind, EventType, OwnerRef } from "../schemas";
import { isRecorded } from "../schemas";

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
    lifecycle: { state: "projected" },
  };
  if (input.endTime !== undefined) event.endTime = input.endTime;
  if (input.amountOz !== undefined) event.amountOz = input.amountOz;
  if (input.owner !== undefined) event.owner = input.owner;
  return event;
}
