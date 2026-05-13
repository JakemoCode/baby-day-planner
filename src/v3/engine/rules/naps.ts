/**
 * R3.1 — The sleep cascade.
 *
 * One sequential rule that walks `settings.wakeWindowsMinutes` from
 * `Day.wakeTime`, alternating wake_window → nap. Subsumes:
 *   - R3.5 / R3.6  (WW geometry follows whichever nap occupies the slot)
 *   - R3.7 / R3.8  (short-recorded-nap shortens the FOLLOWING WW)
 *   - R7.5 / R7.6 / R7.11  (a projected nap at/crossing `bedtimeThreshold`
 *                            becomes bedtime, taking that nap's start)
 *   - R7.4 / R7.4b (no naps or wake_windows past bedtime — we simply stop
 *                   emitting once bedtime lands)
 *
 * Cascade invariant (Jake 2026-05-12):
 *   wake_window(N).startTime === nap(N-1).endTime   (Day.wakeTime for N=1)
 *   wake_window(N).endTime   === nap(N).startTime
 *
 * Reality wins:
 *   - recorded/overridden naps anchor their slot (their startTime/endTime
 *     drive the cascade past them)
 *   - a recorded/overridden bedtime in `actuals` short-circuits the
 *     cascade at its startTime (no further nap/WW emitted past it)
 *
 * Source: docs/v3/REQUIREMENTS.md §3 (nap rules) + §7 (bedtime rules).
 */

import type { Context, Event, Settings } from "../../schemas";
import type { Rule } from "../evaluator";
import { hasType, isProjected, isRecordedEvent, projectedEvent } from "../helpers";

const isNap = hasType("nap");
const isWakeWindow = hasType("wake_window");
const isBedtime = hasType("bedtime");

const RuleSleepCascade: Rule = {
  id: "R3.1",
  description: "Sleep cascade: alternate wake_window/nap, substitute bedtime at threshold",
  // Fire as long as no PROJECTED or RECORDED wake_window exists yet.
  // User-tapped overrides (lifecycle.state: 'overridden') sit in
  // ctx.actuals as metadata carriers — they don't block the cascade;
  // R4.2 merges them onto the projection emitted below.
  matches: (events, ctx) =>
    ctx.day.wakeTime !== undefined &&
    !events.some((e) => isWakeWindow(e) && (isProjected(e) || isRecordedEvent(e))),
  produces: (events, ctx) => projectSleepCascade(ctx, events),
};

function projectSleepCascade(ctx: Context, existing: Event[]): Event[] {
  const wakeTime = ctx.day.wakeTime;
  if (wakeTime === undefined) return existing;

  const wws = ctx.settings.wakeWindowsMinutes;
  const napLen = ctx.settings.defaultNapLengthMinutes;
  const threshold = ctx.settings.bedtimeThreshold;

  // Index existing naps so we don't emit duplicates and so the cascade
  // can defer to reality at each slot.
  const existingNapByKey = new Map<string, Event>();
  for (const e of existing) {
    if (isNap(e)) existingNapByKey.set(e.eventKey, e);
  }

  // A manual bedtime (recorded/overridden) in actuals is authoritative.
  // It pins the cascade's terminator at its startTime — no projected
  // bedtime is emitted, and nothing is emitted past it.
  const manualBedtime = existing.find((e) => isBedtime(e) && !isProjected(e));

  const projected: Event[] = [];
  let cursor = wakeTime;

  for (let i = 0; i < wws.length; i++) {
    const baseWw = wws[i]!;
    // Short-nap adjustment: if the previous nap is RECORDED (lifecycle
    // 'completed') and shorter than shortNapThresholdMinutes, shrink THIS
    // wake window by shortNapAdjustmentMinutes. Annotations (overridden)
    // carry intent, not measurement, and don't trigger the adjustment.
    const prevRecordedShort = i > 0 && isShortRecordedNap(existingNapByKey.get(`nap_${i}`), ctx);
    const wwMinutes = prevRecordedShort
      ? Math.max(0, baseWw - ctx.settings.shortNapAdjustmentMinutes)
      : baseWw;

    const wwStart = cursor;

    // Manual bedtime short-circuit: if wwStart is at/after the manual
    // bedtime, stop entirely. (R7.4 / R7.4b — no orphan WWs or naps
    // beyond the authoritative bedtime.)
    if (manualBedtime && wwStart >= manualBedtime.startTime) break;

    const n = i + 1;
    const napKey = `nap_${n}`;
    const existingNap = existingNapByKey.get(napKey);

    // The nap's startTime is whichever the cascade lands on: reality
    // wins (recorded/overridden) over projection.
    //
    // R3.6 inversion guard: an overridden start earlier than wwStart
    // (e.g. user shifted it before the previous nap ended) clamps to
    // wwStart so the WW renders zero-length rather than negative.
    const napStart = existingNap ? Math.max(wwStart, existingNap.startTime) : wwStart + wwMinutes;

    // Bedtime substitution (R7.5 / R7.6 / R7.11): if no manual bedtime
    // exists AND this slot's PROJECTED nap would reach the threshold
    // (start ≥ threshold OR its interval crosses it), emit bedtime at
    // napStart and stop the cascade. Reality wins: a recorded/overridden
    // nap at this slot is NOT substituted — it stays as a nap.
    const wouldCrossThreshold = napStart >= threshold || napStart + napLen > threshold;
    if (!manualBedtime && !existingNap && wouldCrossThreshold) {
      projected.push(buildWakeWindow(ctx, n, wwStart, napStart));
      projected.push(buildProjectedBedtime(ctx, napStart, ctx.settings));
      break;
    }

    // If a manual bedtime sits between wwStart and the would-be napStart,
    // truncate the WW at bedtime and stop — no nap_n emitted.
    if (manualBedtime && napStart >= manualBedtime.startTime) {
      projected.push(buildWakeWindow(ctx, n, wwStart, manualBedtime.startTime));
      break;
    }

    projected.push(buildWakeWindow(ctx, n, wwStart, napStart));

    if (existingNap) {
      // Cursor advances from reality's endTime.
      cursor = existingNap.endTime ?? existingNap.startTime + napLen;
    } else {
      const napEnd = napStart + napLen;
      projected.push(
        projectedEvent({
          ctx,
          id: `proj_nap_${n}`,
          eventKey: napKey,
          type: "nap",
          kind: "block",
          startTime: napStart,
          endTime: napEnd,
          label: `Nap ${n}`,
        }),
      );
      cursor = napEnd;
    }
  }

  return [...existing, ...projected];
}

function buildWakeWindow(ctx: Context, n: number, start: number, end: number): Event {
  return projectedEvent({
    ctx,
    id: `proj_wake_window_${n}`,
    eventKey: `wake_window_${n}`,
    type: "wake_window",
    kind: "block",
    startTime: start,
    endTime: end,
    label: `Wake window ${n}`,
  });
}

function buildProjectedBedtime(ctx: Context, start: number, settings: Settings): Event {
  // R7.1: bedtime's endTime defaults to next morning's defaultWakeTime
  // (24h ahead in cross-day notation).
  return projectedEvent({
    ctx,
    id: "proj_bedtime",
    eventKey: "bedtime",
    type: "bedtime",
    kind: "block",
    startTime: start,
    endTime: settings.defaultWakeTime + 24 * 60,
    label: "Bedtime",
  });
}

function isShortRecordedNap(nap: Event | undefined, ctx: Context): boolean {
  if (!nap) return false;
  if (nap.lifecycle.state !== "completed") return false;
  if (nap.endTime === undefined) return false;
  const duration = nap.endTime - nap.startTime;
  return duration < ctx.settings.shortNapThresholdMinutes;
}

export const RULES: Rule[] = [RuleSleepCascade];
