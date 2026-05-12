/**
 * Form → V3 Event transform. Lifecycle dispatch lives here, isolated
 * from the React drawer so it can be unit-tested without renderHook
 * boilerplate.
 *
 * Rules:
 *   - projected source + time changed + endTime present + nap/bedtime  → overridden
 *   - projected source + time changed + endTime present + other        → completed
 *   - projected source + time changed + no endTime (block)              → started
 *   - projected source + time changed + instant                         → completed
 *   - projected source + no time change                                 → overridden
 *   - overridden source + time changed + nap/bedtime                    → overridden
 *   - overridden source + time changed + other                          → completed (locks the time)
 *   - already-recorded source (started/completed):
 *       state stays; field edits apply.
 *
 * Predict-don't-prescribe carve-out (2026-05-12): naps and bedtime
 * preserve their "future intent" lifecycle through drawer time-edits.
 * Only the action buttons (Start Nap, End Nap) promote a nap to
 * started/completed. This preserves `hasPutdown` across reschedules —
 * the rule was the "changing nap time removes putdown" bug. Other event
 * types (extras, etc.) keep the V2-style "time-edit = lock in time"
 * semantic because they have no action-button start/end ceremony.
 *
 * `nowMinutes` carries the timestamp the lifecycle should record. The
 * caller (drawer) supplies it from the clock at save time so we don't
 * pull a clock dependency into this pure transform.
 */

import type { Event, Lifecycle, OwnerRef, TimeMin } from "../../schemas";

export type FormState = {
  startTime: TimeMin;
  endTime: TimeMin | undefined;
  amountOz: number | undefined;
  owner: OwnerRef | undefined;
  label: string;
};

export function formToEvent(form: FormState, source: Event, nowMinutes: TimeMin): Event {
  const timeChanged = form.startTime !== source.startTime || form.endTime !== source.endTime;

  const lifecycle: Lifecycle = computeLifecycle(source, timeChanged, form.endTime, nowMinutes);

  const next: Event = {
    ...source,
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

  if (form.owner !== undefined) {
    next.owner = form.owner;
  } else {
    delete (next as { owner?: OwnerRef }).owner;
  }

  return next;
}

/**
 * For naps and bedtime, drawer time-edits are scheduling intent — they
 * never promote to a recorded state. The action buttons (Start Nap,
 * End Nap) own the projected → started → completed lifecycle for these
 * event types. See the predict-don't-prescribe carve-out in the header.
 */
function isSchedulingType(type: Event["type"]): boolean {
  return type === "nap" || type === "bedtime";
}

function computeLifecycle(
  source: Event,
  timeChanged: boolean,
  endTime: TimeMin | undefined,
  nowMinutes: TimeMin,
): Lifecycle {
  if (source.lifecycle.state === "projected") {
    if (!timeChanged) return { state: "overridden", annotatedAt: nowMinutes };
    // Block with no endTime is "I started this but it's not done yet."
    if (source.kind === "block" && endTime === undefined) {
      return { state: "started", committedAt: nowMinutes };
    }
    // Scheduling-type carve-out: nap/bedtime time-edits are intent,
    // not reality. Stay in the non-recorded `overridden` state so the
    // engine continues to treat the event as a future projection
    // (preserves hasPutdown).
    if (isSchedulingType(source.type)) {
      return { state: "overridden", annotatedAt: nowMinutes };
    }
    return { state: "completed", committedAt: nowMinutes };
  }
  // Overridden + time edit:
  //   nap/bedtime — stay overridden (re-scheduling is still scheduling).
  //   other       — promote to completed (locks the time in).
  if (source.lifecycle.state === "overridden" && timeChanged) {
    if (isSchedulingType(source.type)) {
      return { state: "overridden", annotatedAt: nowMinutes };
    }
    return { state: "completed", committedAt: nowMinutes };
  }
  // Already-recorded states stay as-is.
  return source.lifecycle;
}
