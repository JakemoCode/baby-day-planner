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
 * Source: docs/v3/ENGINE_SPEC.md §3 (nap rules) + §7 (bedtime rules).
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

  // Two classes of real naps:
  //   - slot-keyed (`nap_N` eventKey): the user/promotion path declared
  //     this nap fills cascade slot N (e.g. drawer-edit on a projected
  //     nap, or NapActionButton's nextProjectedNap promotion). Slot-keyed
  //     naps ALWAYS claim slot N regardless of distance from natural —
  //     reality wins for that slot.
  //   - additive (non-slot eventKey, e.g. UUID): the FAB Add Nap path.
  //     Purely additive — never displaces a slot. Inserted into the
  //     rhythm chronologically when its startTime falls within a slot's
  //     natural placement window.
  //
  // This split preserves the slot-claiming semantics of `nap_N` (so a
  // late-recorded nap_2 still stretches ww_2 even when far from
  // natural) while adding a chronological-insert path for FAB-added
  // UUID naps that re-anchors downstream projections.
  const slotKeyedNapByN = new Map<number, Event>();
  const additives: Event[] = [];
  for (const e of existing) {
    if (!isNap(e) || isProjected(e)) continue;
    const m = /^nap_(\d+)$/.exec(e.eventKey);
    if (m && m[1]) {
      slotKeyedNapByN.set(parseInt(m[1], 10), e);
    } else {
      additives.push(e);
    }
  }
  additives.sort((a, b) => a.startTime - b.startTime);

  // A manual bedtime (recorded/overridden) in actuals is authoritative.
  // It pins the cascade's terminator at its startTime — no projected
  // bedtime is emitted, and nothing is emitted past it.
  const manualBedtime = existing.find((e) => isBedtime(e) && !isProjected(e));

  const projected: Event[] = [];
  let cursor = wakeTime;
  let additiveIdx = 0;
  let prevNap: Event | undefined;

  for (let i = 0; i < wws.length; i++) {
    const baseWw = wws[i]!;
    // Short-nap adjustment based on the previous nap (slot-keyed,
    // additive, or projected) — only RECORDED short naps trigger.
    const prevRecordedShort = isShortRecordedNap(prevNap, ctx);
    const wwMinutes = prevRecordedShort
      ? Math.max(0, baseWw - ctx.settings.shortNapAdjustmentMinutes)
      : baseWw;

    const wwStart = cursor;
    const naturalNapStart = wwStart + wwMinutes;

    if (manualBedtime && wwStart >= manualBedtime.startTime) break;

    const n = i + 1;
    const slotKeyed = slotKeyedNapByN.get(n);

    // Skip additives that ended before cursor (already accounted for).
    while (
      additiveIdx < additives.length &&
      (additives[additiveIdx]!.endTime ?? additives[additiveIdx]!.startTime + napLen) <= cursor
    ) {
      additiveIdx++;
    }
    const nextAdditive: Event | undefined = additives[additiveIdx];

    // Decide what fills this slot:
    //   1. Slot-keyed (`nap_N`) wins if present — always claims slot N.
    //   2. Else, if the next additive's startTime falls within the
    //      slot's natural window [wwStart, naturalNapStart + napLen],
    //      it consumes this slot (FAB-added nap inserted into rhythm).
    //   3. Else, project the slot.
    let chosen: Event | undefined;
    let consumedAdditive = false;
    if (slotKeyed) {
      chosen = slotKeyed;
    } else if (
      nextAdditive !== undefined &&
      nextAdditive.startTime <= naturalNapStart + napLen
    ) {
      chosen = nextAdditive;
      consumedAdditive = true;
    }

    // R3.6 inversion guard: a chosen nap with start earlier than wwStart
    // clamps to wwStart so the WW renders zero-length rather than
    // negative.
    const napStart = chosen ? Math.max(wwStart, chosen.startTime) : naturalNapStart;

    // Bedtime substitution (projection-only path): no manual bedtime,
    // no chosen real nap, projected nap would reach/cross threshold →
    // emit bedtime at napStart, stop.
    const wouldCrossThreshold = napStart >= threshold || napStart + napLen > threshold;
    if (!manualBedtime && !chosen && wouldCrossThreshold) {
      projected.push(buildWakeWindow(ctx, n, wwStart, napStart));
      projected.push(buildProjectedBedtime(ctx, napStart, ctx.settings));
      break;
    }

    // Bedtime coercion (real nap past threshold): per DOMAIN.md §3, any
    // sleep at/after threshold IS bedtime. Emit a bedtime derived from
    // the real nap's id/eventKey/owner so taps map back to the same
    // Firestore doc. Doc stays type=nap; only the projection mutates.
    // Applies to both slot-keyed and additive chosen naps.
    if (!manualBedtime && chosen && chosen.startTime >= threshold) {
      projected.push(buildWakeWindow(ctx, n, wwStart, napStart));
      projected.push(buildCoercedBedtime(ctx, chosen, ctx.settings));
      if (consumedAdditive) additiveIdx++;
      break;
    }

    if (manualBedtime && napStart >= manualBedtime.startTime) {
      projected.push(buildWakeWindow(ctx, n, wwStart, manualBedtime.startTime));
      break;
    }

    projected.push(buildWakeWindow(ctx, n, wwStart, napStart));

    if (chosen) {
      cursor = chosen.endTime ?? chosen.startTime + napLen;
      prevNap = chosen;
      if (consumedAdditive) additiveIdx++;
    } else {
      const napEnd = napStart + napLen;
      const projNap = projectedEvent({
        ctx,
        id: `proj_nap_${n}`,
        eventKey: `nap_${n}`,
        type: "nap",
        kind: "block",
        startTime: napStart,
        endTime: napEnd,
        label: `Nap ${n}`,
      });
      projected.push(projNap);
      cursor = napEnd;
      prevNap = projNap;
    }
  }

  return [...existing, ...projected];
}

function buildCoercedBedtime(_ctx: Context, realNap: Event, settings: Settings): Event {
  // Engine-coerce: a real nap whose startTime ≥ bedtimeThreshold
  // projects as bedtime per DOMAIN.md §3. The Firestore doc stays
  // type=nap (and remains in the output via `existing`); this is a
  // SEPARATE projected bedtime event derived from the nap's data.
  //
  // Why a derived id rather than reusing the nap's id: the evaluator's
  // `checkRealityWins` invariant rejects any output event with a
  // recorded event's id but a different type. Using a `coerced_bedtime_`
  // prefix keeps the bedtime distinct in the engine's eventes list
  // while letting the render layer associate it back to the nap doc
  // for tap-routing.
  return {
    id: `coerced_bedtime_${realNap.id}`,
    dayId: realNap.dayId,
    eventKey: `bedtime_coerced_${realNap.eventKey}`,
    type: "bedtime",
    kind: "block",
    startTime: realNap.startTime,
    endTime: realNap.endTime ?? settings.defaultWakeTime + 24 * 60,
    label: "Bedtime",
    owner: realNap.owner,
    hasPutdown: false,
    lifecycle: { state: "projected" },
  };
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
