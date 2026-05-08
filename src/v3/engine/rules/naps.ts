/**
 * R3.x — Nap rules.
 *
 * Source: docs/v3/REQUIREMENTS.md §3.
 */

import type { Context, Event } from "../../schemas";
import type { Rule } from "../evaluator";

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
  matches: (events, ctx) =>
    ctx.day.wakeTime !== undefined && !events.some((e) => e.type === "wake_window"),
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
    if (e.type === "nap") existingByKey.set(e.eventKey, e);
  }

  const projected: Event[] = [];
  let cursor = wakeTime;

  for (let i = 0; i < wws.length; i++) {
    const wwMinutes = wws[i]!;
    const wwStart = cursor;
    const wwEnd = wwStart + wwMinutes;
    const n = i + 1;

    projected.push({
      id: `proj_wake_window_${n}`,
      dayId: ctx.day.id,
      eventKey: `wake_window_${n}`,
      type: "wake_window",
      kind: "block",
      startTime: wwStart,
      endTime: wwEnd,
      label: `Wake window ${n}`,
      hasPutdown: false,
      lifecycle: { state: "projected" },
    });

    const napKey = `nap_${n}`;
    const recorded = existingByKey.get(napKey);
    if (!recorded) {
      const napStart = wwEnd;
      const napEnd = napStart + napLen;
      projected.push({
        id: `proj_nap_${n}`,
        dayId: ctx.day.id,
        eventKey: napKey,
        type: "nap",
        kind: "block",
        startTime: napStart,
        endTime: napEnd,
        label: `Nap ${n}`,
        hasPutdown: false,
        lifecycle: { state: "projected" },
      });
      cursor = napEnd;
    } else {
      // Cascade continues from the recorded nap's end (or fall through to
      // the next default-length tick if endTime is missing — e.g. started
      // but not ended).
      cursor = recorded.endTime ?? recorded.startTime + napLen;
    }
  }

  // Preserve any pre-existing events the caller passed in (recorded naps
  // and anything else). The reality-wins guard in the evaluator enforces
  // this; we simply concat.
  return [...existing, ...projected];
}

export const RULES: Rule[] = [RuleProjectNapChain];
