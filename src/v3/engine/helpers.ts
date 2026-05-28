/** Shared predicate and event-construction helpers for V3 rules. */

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

/** Pre-bound predicates for types used in multiple rule files. */
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

/** Build a projected Event; optional fields omitted when undefined (exactOptionalPropertyTypes). */
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
    owner: input.owner ?? NO_OWNER, // owner is required; default to unassigned
    lifecycle: { state: "projected" },
  };
  if (input.endTime !== undefined) event.endTime = input.endTime;
  if (input.amountOz !== undefined) event.amountOz = input.amountOz;
  return event;
}
