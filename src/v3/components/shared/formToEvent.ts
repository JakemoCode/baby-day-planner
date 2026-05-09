/**
 * Form → V3 Event transform. Lifecycle dispatch lives here, isolated
 * from the React drawer so it can be unit-tested without renderHook
 * boilerplate.
 *
 * Rules (parity with V2's `recorded` heuristic, mapped to V3 lifecycle):
 *   - projected source + time changed + endTime present  → completed
 *   - projected source + time changed + no endTime block → started
 *   - projected source + time changed + instant          → completed
 *   - projected source + no time change                  → overridden
 *   - already-recorded source (started/completed/overridden):
 *       state stays; field edits apply. If the user edits time on an
 *       overridden event, it promotes to completed (locking in the
 *       recorded time).
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
    return { state: "completed", committedAt: nowMinutes };
  }
  // Overridden + time edit → promote to completed (locking the time in).
  if (source.lifecycle.state === "overridden" && timeChanged) {
    return { state: "completed", committedAt: nowMinutes };
  }
  // Already-recorded states stay as-is.
  return source.lifecycle;
}
