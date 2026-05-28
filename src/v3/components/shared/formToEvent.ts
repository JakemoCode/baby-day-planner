/**
 * Form → V3 Event transform. Thin wrapper: reads form values, dispatches
 * a single DRAWER_SAVE action to reduceLifecycle, and assembles the event.
 * All lifecycle decision logic lives in lifecycle.ts — see that file and
 * ARCHITECTURE_V3 §4 for the authoritative transition rules.
 *
 * `nowMinutes` carries the timestamp the lifecycle should record. The
 * caller (drawer) supplies it from the clock at save time so we don't
 * pull a clock dependency into this pure transform.
 */

import { NO_OWNER, type Event, type OwnerRef, type TimeMin } from "../../schemas";
import { reduceLifecycle } from "../../lifecycle";

export type FormState = {
  startTime: TimeMin;
  endTime: TimeMin | undefined;
  amountOz: number | undefined;
  owner: OwnerRef | undefined;
  label: string;
};

export function formToEvent(
  form: FormState,
  source: Event,
  nowMinutes: TimeMin,
  mode: "create" | "edit" = "edit",
): Event {
  const timeChanged = form.startTime !== source.startTime || form.endTime !== source.endTime;

  // Custom events derive kind from the form: endTime present → block,
  // absent → instant. The template defaults to one (see
  // createEventTemplate.ts); the final shape is decided here at save.
  // Other event types keep their schema-defined kind regardless.
  const kind: Event["kind"] =
    source.type === "extra" ? (form.endTime !== undefined ? "block" : "instant") : source.kind;

  const lifecycle = reduceLifecycle(source.lifecycle, {
    type: "DRAWER_SAVE",
    eventType: source.type,
    eventKind: kind,
    timeChanged,
    hasEndTime: form.endTime !== undefined,
    nowMinutes,
    mode,
    startTime: form.startTime,
  });

  const next: Event = {
    ...source,
    kind,
    startTime: form.startTime,
    label: form.label || source.label,
    lifecycle,
  };

  if (form.endTime !== undefined) {
    next.endTime = form.endTime;
  } else {
    delete (next as { endTime?: TimeMin }).endTime;
  }

  if (form.amountOz !== undefined) {
    next.amountOz = form.amountOz;
  } else {
    delete (next as { amountOz?: number }).amountOz;
  }

  // §F37: owner is required; "no owner" is the explicit NO_OWNER value
  // (not a deleted/missing field). The picker always provides one.
  next.owner = form.owner ?? NO_OWNER;

  return next;
}
