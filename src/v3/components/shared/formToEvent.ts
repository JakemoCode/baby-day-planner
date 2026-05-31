/**
 * Form → V3 Event transform. Dispatches DRAWER_SAVE to reduceLifecycle.
 * `nowMinutes` is supplied by the caller so this stays a pure transform.
 */

import { NO_OWNER, type Event, type OwnerRef, type TimeMin } from "../../schemas";
import { reduceLifecycle } from "../../lifecycle";

export type FormState = {
  startTime: TimeMin;
  endTime: TimeMin | undefined;
  amountOz: number | undefined;
  owner: OwnerRef | undefined;
  label: string;
  pumpVolumeOz?: { left: number; right: number };
};

export function formToEvent(
  form: FormState,
  source: Event,
  nowMinutes: TimeMin,
  mode: "create" | "edit" = "edit",
): Event {
  const timeChanged = form.startTime !== source.startTime || form.endTime !== source.endTime;

  // Custom events: endTime present → block, absent → instant (decided at save time).
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

  if (form.pumpVolumeOz !== undefined) {
    next.pumpVolumeOz = form.pumpVolumeOz;
  } else {
    delete (next as { pumpVolumeOz?: { left: number; right: number } }).pumpVolumeOz;
  }

  // owner is required; NO_OWNER is explicit, never absent.
  next.owner = form.owner ?? NO_OWNER;

  return next;
}
