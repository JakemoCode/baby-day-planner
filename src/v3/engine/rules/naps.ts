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
  matches: (events, ctx) => ctx.day.wakeTime !== undefined && events.length === 0,
  produces: (_events, ctx) => projectBaseNapChain(ctx),
};

function projectBaseNapChain(ctx: Context): Event[] {
  const wakeTime = ctx.day.wakeTime;
  if (wakeTime === undefined) return [];

  const wws = ctx.settings.wakeWindowsMinutes;
  const napLen = ctx.settings.defaultNapLengthMinutes;

  const out: Event[] = [];
  let cursor = wakeTime;

  for (let i = 0; i < wws.length; i++) {
    const wwMinutes = wws[i]!;
    const wwStart = cursor;
    const wwEnd = wwStart + wwMinutes;
    const napStart = wwEnd;
    const napEnd = napStart + napLen;
    const n = i + 1;

    out.push({
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

    out.push({
      id: `proj_nap_${n}`,
      dayId: ctx.day.id,
      eventKey: `nap_${n}`,
      type: "nap",
      kind: "block",
      startTime: napStart,
      endTime: napEnd,
      label: `Nap ${n}`,
      hasPutdown: false,
      lifecycle: { state: "projected" },
    });

    cursor = napEnd;
  }

  return out;
}

export const RULES: Rule[] = [RuleProjectNapChain];
