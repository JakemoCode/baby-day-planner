/**
 * R4.2 — Merge user-tapped wake_window owner overrides onto the
 * cascade-derived projection, then drop the override doc.
 *
 * V2 had this rule under `applyWakeWindowOverrides`. It was silently
 * dropped during the V3 cutover; restored 2026-05-12 per Jake's
 * "wake window owners should absolutely be retained when the day
 * recalculates."
 *
 * Mechanics:
 * - UI persists an Event doc when the user picks an owner on a projected
 *   wake_window: `{ type: 'wake_window', eventKey: 'wake_window_2',
 *   lifecycle.state: 'overridden', owner, label? }`.
 * - That doc lives in `ctx.actuals` and seeds the events array.
 * - R3.1 emits a fresh PROJECTED wake_window_2 from the nap cascade
 *   (R3.1's match was loosened to ignore non-projected wake_windows).
 * - This rule (R4.2) merges the override's `owner` and `label` onto the
 *   projection, then filters the override doc out so the timeline shows
 *   one wake_window per slot.
 *
 * Time NEVER flows from the override (predict-don't-prescribe — a stale
 * override's geometry would clobber a freshly-recomputed cascade time).
 * Only owner and label are carried.
 *
 * Stray overrides — docs whose eventKey doesn't match any projection in
 * this day's cascade (e.g. wakeWindowsMinutes shrunk since the override
 * was written) — are silently dropped. No projection to merge onto means
 * the override has no anchor.
 */

import type { Event } from "../../schemas";
import type { Rule } from "../evaluator";
import { hasType, isProjected } from "../helpers";

const isWakeWindow = hasType("wake_window");

function isWakeWindowOverride(e: Event): boolean {
  return isWakeWindow(e) && e.lifecycle.state === "overridden";
}

const RuleApplyWakeWindowOverrides: Rule = {
  id: "R4.2",
  description: "Merge wake_window owner/label overrides onto projections; drop the override docs",
  dependsOn: ["R3.1"],
  matches: (events) => events.some(isWakeWindowOverride),
  produces: (events) => {
    const overridesByKey = new Map<string, Event>();
    for (const e of events) {
      if (isWakeWindowOverride(e)) overridesByKey.set(e.eventKey, e);
    }
    if (overridesByKey.size === 0) return events;

    return events.flatMap((e) => {
      if (isWakeWindowOverride(e)) return []; // drop override doc
      if (!isWakeWindow(e) || !isProjected(e)) return [e];
      const override = overridesByKey.get(e.eventKey);
      if (!override) return [e];
      const next: Event = { ...e };
      if (override.owner !== undefined) next.owner = override.owner;
      if (override.label) next.label = override.label;
      return [next];
    });
  },
};

export const RULES: Rule[] = [RuleApplyWakeWindowOverrides];
