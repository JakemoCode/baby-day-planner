/**
 * R3.1 — Sleep cascade: alternates wake_window/nap from wakeTime, substitutes
 * bedtime when the next projected nap would exceed bedtimeThreshold.
 * Recorded naps anchor their slot; a recorded bedtime terminates the cascade.
 */

import type { Context, Event, Settings } from "../../schemas";
import type { Rule } from "../evaluator";
import { isBedtime, isNap, isProjected, isWakeWindow, projectedEvent } from "../helpers";
import { nextDayAt } from "../../ui/time";

const RuleSleepCascade: Rule = {
  id: "R3.1",
  description: "Sleep cascade: alternate wake_window/nap, substitute bedtime at threshold",
  // Recorded wake_window docs are owner-annotation carriers (merged by R4.2), not cascade output;
  // only a projected wake_window means the cascade already ran.
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

  // Index existing naps by slot key; reality wins per DOMAIN.md §1.
  const existingNapByKey = new Map<string, Event>();
  for (const e of existing) {
    if (isNap(e) && /^nap_\d+$/.test(e.eventKey)) {
      existingNapByKey.set(e.eventKey, e);
    }
  }

  // Recorded bedtime pins the cascade terminator; no projected bedtime is emitted past it.
  const manualBedtime = existing.find((e) => isBedtime(e) && !isProjected(e));

  const projected: Event[] = [];
  let cursor = wakeTime;

  // Defensive cap against pathological inputs (threshold misconfigured beyond day length).
  const HARD_CAP = 48;

  for (let n = 1; n <= HARD_CAP; n++) {
    // Repeat the last configured WW beyond wws.length — physiology ends the day, not config.
    const baseWw = wws[Math.min(n - 1, wws.length - 1)]!;
    // Short-nap adjustment: completed (measured) nap, not recorded annotation.
    const prevRecordedShort =
      n > 1 && isShortRecordedNap(existingNapByKey.get(`nap_${n - 1}`), ctx);
    const wwMinutes = prevRecordedShort
      ? Math.max(0, baseWw - ctx.settings.shortNapAdjustmentMinutes)
      : baseWw;

    const wwStart = cursor;

    if (manualBedtime && wwStart >= manualBedtime.startTime) break; // no orphan WWs past recorded bedtime

    const napKey = `nap_${n}`;
    const existingNap = existingNapByKey.get(napKey);

    // Clamp recorded nap start to wwStart (R3.6 inversion guard: user may have shifted nap before WW end).
    const napStart = existingNap ? Math.max(wwStart, existingNap.startTime) : wwStart + wwMinutes;

    // Cascade terminator (DOMAIN §1/§3): a PROJECTED nap ends the day —
    // becoming bedtime — when it would either end after bedtimeThreshold
    // (the next sleep IS bedtime), or leave no room for a proper wake
    // window before an authoritative manual bedtime (gap < the following
    // WW's configured length; subsumes the old "extends INTO bedtime"
    // suppression). Both run whether bedtime is projected or manual — a
    // manual bedtime only changes WHERE the terminator lands. Recorded
    // naps pass through (reality wins).
    const projectedNapEnd = napStart + napLen;
    if (!existingNap) {
      const followingWw = wws[Math.min(n, wws.length - 1)]!;
      const crowdsManualBedtime =
        manualBedtime !== undefined && manualBedtime.startTime - projectedNapEnd < followingWw;
      if (projectedNapEnd > threshold || crowdsManualBedtime) {
        projected.push(...terminateCascade(ctx, n, wwStart, wwMinutes, manualBedtime));
        break;
      }
    }

    projected.push(buildWakeWindow(ctx, n, wwStart, napStart));

    if (existingNap) {
      // Use raw endTime (not render-time effectiveEndOf) so past naps don't stretch future WWs.
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
 * Emits the closing wake-window + projected bedtime (if no manual bedtime).
 * Bedtime anchor = manualBedtime.startTime ?? max(earliestBedtime, wwStart + wwMinutes).
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
  // endTime = next morning's defaultWakeTime in cross-day notation.
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
