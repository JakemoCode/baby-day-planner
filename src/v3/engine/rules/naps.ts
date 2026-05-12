/**
 * R3.x — Nap rules.
 *
 * Source: docs/v3/REQUIREMENTS.md §3.
 */

import type { Context, Event } from "../../schemas";
import type { Rule } from "../evaluator";
import { hasType, isProjected, isRecordedEvent, projectedEvent } from "../helpers";

const isNap = hasType("nap");
const isWakeWindow = hasType("wake_window");

/**
 * R3.1 — Project the day's base nap chain from settings.wakeWindowsMinutes.
 *
 * From Day.wakeTime, alternate wake_window → nap. The Nth wake window lasts
 * settings.wakeWindowsMinutes[N-1]; each nap defaults to
 * settings.defaultNapLengthMinutes.
 */
const RuleProjectNapChain: Rule = {
  id: "R3.1",
  description: "Project the day's base nap chain from settings.wakeWindowsMinutes",
  // Fire as long as no PROJECTED or RECORDED wake_window exists yet.
  // User-tapped overrides (lifecycle.state: 'overridden') sit in
  // ctx.actuals as metadata carriers — they don't block the cascade;
  // R4.2 merges them onto the projection R3.1 emits below. Recorded
  // wake_windows (state: started/completed) are blocked defensively:
  // schema intent is that wake_windows are always projected, but if a
  // future code path ever produces one we don't want a duplicate
  // eventKey emitted alongside it.
  matches: (events, ctx) =>
    ctx.day.wakeTime !== undefined &&
    !events.some((e) => isWakeWindow(e) && (isProjected(e) || isRecordedEvent(e))),
  produces: (events, ctx) => projectBaseNapChain(ctx, events),
};

function projectBaseNapChain(ctx: Context, existing: Event[]): Event[] {
  const wakeTime = ctx.day.wakeTime;
  if (wakeTime === undefined) return existing;

  const wws = ctx.settings.wakeWindowsMinutes;
  const napLen = ctx.settings.defaultNapLengthMinutes;

  // Index existing nap events by eventKey so we don't emit duplicates.
  // Recorded naps stay (reality wins, R3.3); projected naps would only be
  // present if another rule had emitted them earlier — for R3.1 that's
  // never the case yet.
  const existingByKey = new Map<string, Event>();
  for (const e of existing) {
    if (isNap(e)) existingByKey.set(e.eventKey, e);
  }

  const projected: Event[] = [];
  let cursor = wakeTime;

  for (let i = 0; i < wws.length; i++) {
    const baseWw = wws[i]!;
    // R3.7/R3.8: if the previous nap is recorded and shorter than the
    // shortNapThresholdMinutes, shorten THIS wake window by
    // shortNapAdjustmentMinutes. Only applies for i >= 1 (there's a
    // previous nap to compare). Unrecorded annotations don't trigger it.
    const prevRecordedShort = i > 0 && isShortRecordedNap(existingByKey.get(`nap_${i}`), ctx);
    const wwMinutes = prevRecordedShort
      ? Math.max(0, baseWw - ctx.settings.shortNapAdjustmentMinutes)
      : baseWw;

    const wwStart = cursor;
    const n = i + 1;
    const napKey = `nap_${n}`;
    const existingNap = existingByKey.get(napKey);

    // Cascade invariant (Jake, 2026-05-12):
    //   wake_window(N).startTime === nap(N-1).endTime    (Day.wakeTime for N=1)
    //   wake_window(N).endTime   === nap(N).startTime
    // Wake windows END because naps START; wake windows START because
    // naps END. No special-casing on lifecycle state — the WW geometry
    // follows whatever nap occupies the slot, projected or otherwise.
    //
    // R3.6 (inversion guard): if a user-edited nap.startTime lands
    // before wwStart (e.g. they shifted it earlier than the previous
    // nap ended), clamp wwEnd to wwStart so the WW renders zero-length
    // rather than negative.
    const wwEnd = existingNap ? Math.max(wwStart, existingNap.startTime) : wwStart + wwMinutes;

    projected.push(
      projectedEvent({
        ctx,
        id: `proj_wake_window_${n}`,
        eventKey: `wake_window_${n}`,
        type: "wake_window",
        kind: "block",
        startTime: wwStart,
        endTime: wwEnd,
        label: `Wake window ${n}`,
      }),
    );

    if (!existingNap) {
      // No nap occupies this slot — emit a fresh projected one.
      const napEnd = wwEnd + napLen;
      projected.push(
        projectedEvent({
          ctx,
          id: `proj_nap_${n}`,
          eventKey: napKey,
          type: "nap",
          kind: "block",
          startTime: wwEnd,
          endTime: napEnd,
          label: `Nap ${n}`,
        }),
      );
      cursor = napEnd;
    } else {
      // Existing nap (recorded, overridden, or otherwise) — skip emitting
      // a duplicate, advance cursor from the nap's actual end.
      cursor = existingNap.endTime ?? existingNap.startTime + napLen;
    }
  }

  // Preserve any pre-existing events the caller passed in (recorded naps
  // and anything else). The reality-wins guard in the evaluator enforces
  // this; we simply concat.
  return [...existing, ...projected];
}

/**
 * R3.8: only RECORDED naps drive the short-nap adjustment. Unrecorded
 * annotations (overridden, projected) carry intent, not measurement.
 */
function isShortRecordedNap(nap: Event | undefined, ctx: Context): boolean {
  if (!nap) return false;
  if (nap.lifecycle.state !== "completed") return false;
  if (nap.endTime === undefined) return false;
  const duration = nap.endTime - nap.startTime;
  return duration < ctx.settings.shortNapThresholdMinutes;
}

export const RULES: Rule[] = [RuleProjectNapChain];
