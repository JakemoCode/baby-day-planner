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
 * Predict-don't-prescribe carve-out: naps and bedtime own their
 * projected → started → completed transitions via the Start Nap /
 * End Nap action buttons. The drawer is scheduling intent, not
 * reality — so drawer time-edits stay in `overridden`, preserving
 * `hasPutdown` across reschedules. Other event types fall through to
 * the V2 "time-edit locks in time" semantic.
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
 * Event types for which drawer time-edits are scheduling intent, not
 * recordings of reality. These types have no Start/End action-button
 * ceremony, so the drawer is purely "this is when I plan to do this,"
 * never "this is what happened."
 *
 * - `nap` / `bedtime`: Start Nap / End Nap action buttons own the
 *   projected → started → completed flow. Drawer is scheduling.
 * - `daily_recurring`: recurring entries (Cook Dinner, etc.) have no
 *   action buttons at all. A drawer time-edit is a one-day reschedule,
 *   not a recording — tomorrow still projects at the configured time.
 *
 * Caveat: not every `daily_recurring` is purely forecast. A medication
 * dose configured as a daily_recurring is reality-shaped (the time it
 * was taken matters as a recording, not a forecast). If that distinction
 * becomes important, split the type or add a per-entry flag — for now
 * the predict-don't-prescribe default wins.
 */
function isSchedulingType(type: Event["type"]): boolean {
  return type === "nap" || type === "bedtime" || type === "daily_recurring";
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
