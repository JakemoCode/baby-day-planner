/**
 * R3.1 — The sleep cascade.
 *
 * One sequential rule that walks `settings.wakeWindowsMinutes` from
 * `Day.wakeTime`, alternating wake_window → nap. Subsumes:
 *   - R3.5 / R3.6  (WW geometry follows whichever nap occupies the slot)
 *   - R3.7 / R3.8  (short-recorded-nap shortens the FOLLOWING WW)
 *   - ADR-0002: drop projected nap whose endTime > bedtimeThreshold;
 *               project bedtime at max(earliestBedtime, lastNapEnd + WW)
 *   - R7.4 / R7.4b (no naps or wake_windows past bedtime — we simply stop
 *                   emitting once bedtime lands)
 *
 * Cascade invariant (Jake 2026-05-12):
 *   wake_window(N).startTime === nap(N-1).endTime   (Day.wakeTime for N=1)
 *   wake_window(N).endTime   === nap(N).startTime
 *
 * Reality wins:
 *   - recorded/completed naps anchor their slot (their startTime/endTime
 *     drive the cascade past them)
 *   - a recorded/completed bedtime in `actuals` short-circuits the
 *     cascade at its startTime (no further nap/WW emitted past it)
 *
 * Source: docs/v3/ENGINE_SPEC.md §3 (nap rules) + §7 (bedtime rules).
 */

import type { Context, Event, Settings } from "../../schemas";
import type { Rule } from "../evaluator";
import { isBedtime, isNap, isProjected, isWakeWindow, projectedEvent } from "../helpers";
import { nextDayAt } from "../../ui/time";

const RuleSleepCascade: Rule = {
  id: "R3.1",
  description: "Sleep cascade: alternate wake_window/nap, substitute bedtime at threshold",
  // Fire as long as no PROJECTED wake_window exists yet.
  // Owner-annotation events (wake_window docs with lifecycle.state: 'recorded'
  // from ctx.actuals) are scheduling metadata carriers — they must NOT block
  // the cascade. R4.2 merges them onto the projected wake_windows emitted here.
  // Only a completed or projected wake_window means the cascade already ran.
  matches: (events, ctx) =>
    ctx.day.wakeTime !== undefined && !events.some((e) => isWakeWindow(e) && isProjected(e)),
  produces: (events, ctx) => projectSleepCascade(ctx, events),
};

function projectSleepCascade(ctx: Context, existing: Event[]): Event[] {
  const wakeTime = ctx.day.wakeTime;
  if (wakeTime === undefined) return existing;

  const wws = ctx.settings.wakeWindowsMinutes;
  const napLen = ctx.settings.defaultNapLengthMinutes;
  const threshold = ctx.settings.bedtimeThreshold;

  if (wws.length === 0) return existing;

  // Index existing naps so we don't emit duplicates and so the cascade
  // can defer to reality at each slot. Slot-keyed naps (`nap_N`
  // eventKey) anchor slot N regardless of how N relates to wws.length —
  // reality wins per DOMAIN.md §1. There's no additive UUID path under
  // the physiology cascade (FAB has no nap option).
  const existingNapByKey = new Map<string, Event>();
  for (const e of existing) {
    if (isNap(e) && /^nap_\d+$/.test(e.eventKey)) {
      existingNapByKey.set(e.eventKey, e);
    }
  }

  // A manual bedtime (recorded) in actuals is authoritative.
  // It pins the cascade's terminator at its startTime — no projected
  // bedtime is emitted, and nothing is emitted past it.
  const manualBedtime = existing.find((e) => isBedtime(e) && !isProjected(e));

  const projected: Event[] = [];
  let cursor = wakeTime;

  // Defensive cap: under reasonable inputs the cascade terminates at
  // bedtime threshold within a single calendar day. The cap prevents
  // pathological loops (e.g., threshold misconfigured beyond physically
  // possible day length).
  const HARD_CAP = 48;

  for (let n = 1; n <= HARD_CAP; n++) {
    // WW length: configured value for slots 1..wws.length; repeat the
    // last value beyond that — physiology, not config, ends the day.
    const baseWw = wws[Math.min(n - 1, wws.length - 1)]!;
    // Short-nap adjustment: if the previous nap is RECORDED (lifecycle
    // 'completed') and shorter than shortNapThresholdMinutes, shrink THIS
    // wake window by shortNapAdjustmentMinutes. Annotations (recorded)
    // carry intent, not measurement, and don't trigger the adjustment.
    const prevRecordedShort =
      n > 1 && isShortRecordedNap(existingNapByKey.get(`nap_${n - 1}`), ctx);
    const wwMinutes = prevRecordedShort
      ? Math.max(0, baseWw - ctx.settings.shortNapAdjustmentMinutes)
      : baseWw;

    const wwStart = cursor;

    // Manual bedtime short-circuit: if wwStart is at/after the manual
    // bedtime, stop entirely. (R7.4 — no orphan WWs or naps beyond the
    // authoritative bedtime.)
    if (manualBedtime && wwStart >= manualBedtime.startTime) break;

    const napKey = `nap_${n}`;
    const existingNap = existingNapByKey.get(napKey);

    // The nap's startTime is whichever the cascade lands on: reality
    // wins (recorded) over projection.
    //
    // R3.6 inversion guard: an recorded start earlier than wwStart
    // (e.g. user shifted it before the previous nap ended) clamps to
    // wwStart so the WW renders zero-length rather than negative.
    const napStart = existingNap ? Math.max(wwStart, existingNap.startTime) : wwStart + wwMinutes;

    // Bedtime substitution (ADR-0002): if no manual bedtime exists AND
    // this slot's PROJECTED nap would have endTime > bedtimeThreshold,
    // drop the nap. Emit a wake-window from wwStart to bedtimeStart
    // (bedtimeStart = max(earliestBedtime, wwStart + wwMinutes) — the
    // final wake window gets its full configured length before bedtime,
    // per DOMAIN §3 "bedtime is a fuzzy emergent thing"). Reality
    // wins: a recorded nap at this slot is NOT dropped — it stays as
    // a nap and the cascade continues.
    const projectedNapEnd = napStart + napLen;
    if (!manualBedtime && !existingNap && projectedNapEnd > threshold) {
      projected.push(...terminateCascade(ctx, n, wwStart, wwMinutes, undefined));
      break;
    }

    // Manual bedtime suppression: a manual bedtime is the day's
    // terminator. Suppress any projected nap whose interval would
    // extend INTO it (start >= bedtime OR start+napLen > bedtime).
    // Recorded naps with explicit endTimes still pass through —
    // reality wins. Per DOMAIN.md §3 ("once bedtime hits, all bedtime").
    const projectedExtendsIntoBedtime =
      manualBedtime && !existingNap && napStart + napLen > manualBedtime.startTime;
    if (manualBedtime && (napStart >= manualBedtime.startTime || projectedExtendsIntoBedtime)) {
      projected.push(...terminateCascade(ctx, n, wwStart, wwMinutes, manualBedtime));
      break;
    }

    projected.push(buildWakeWindow(ctx, n, wwStart, napStart));

    if (existingNap) {
      // Cascade cursor advances from the nap's actual endTime (or startTime +
      // napLen if endTime is absent). Auto-extension (effectiveEndOf) is a
      // RENDER-TIME concern — the cascade uses the recorded endTime so that
      // past naps don't stretch future wake-windows into the current hour.
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

/**
 * Terminates the cascade with a closing wake-window + (optional) projected
 * bedtime. The anchor is `manualBedtime.startTime` if one exists, else
 * `max(earliestBedtime, wwStart + wwMinutes)` — the final wake window
 * gets its full configured length before bedtime lands. Per DOMAIN §3:
 * "bedtime is a fuzzy emergent thing, not a clock time" — it floats
 * with the day's last wake-window. earliestBedtime is just the floor,
 * not the default. (§F66 fast-follow B8: previously this anchored at
 * max(earliestBedtime, wwStart), producing a stub 55-min wake window
 * when wwStart < earliestBedtime < wwStart + wwMinutes.)
 *
 * The wake-window always emits; the projected bedtime emits only when
 * no manualBedtime is present (otherwise the manual one is the day's
 * authoritative terminator).
 */
function terminateCascade(
  ctx: Context,
  n: number,
  wwStart: number,
  wwMinutes: number,
  manualBedtime: Event | undefined,
): Event[] {
  const anchor = manualBedtime
    ? manualBedtime.startTime
    : Math.max(ctx.settings.earliestBedtime, wwStart + wwMinutes);
  const out: Event[] = [buildWakeWindow(ctx, n, wwStart, anchor)];
  if (!manualBedtime) {
    out.push(buildProjectedBedtime(ctx, anchor, ctx.settings));
  }
  return out;
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
    endTime: nextDayAt(settings.defaultWakeTime),
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
