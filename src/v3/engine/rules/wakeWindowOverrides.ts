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
 *   lifecycle.state: 'recorded', owner, label? }`.
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
  return isWakeWindow(e) && e.lifecycle.state === "recorded";
}

const RuleApplyWakeWindowOverrides: Rule = {
  id: "R4.2",
  description: "Merge wake_window owner/label overrides onto projections; drop the override docs",
  // R3.1 emits the cascade-derived projections we stamp.
  // R12.3 stamps template owners; R4.2 must run AFTER it so override wins.
  // The reverse order also produces the correct final state (R4.2 stamps
  // unconditionally), but declaring the edge in the topo graph encodes the
  // "override beats template" contract instead of relying on ALL_RULES
  // array order — future refactors stay safe.
  dependsOn: ["R3.1", "R12.3"],
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
  // R3.1's matches predicate ("no PROJECTED wake_window") works because R4.2
  // reliably drops every recorded wake_window annotation doc after merging.
  // If any survive, R3.1 would misfire and produce a double-projection.
  assertAfter: (events) => {
    const orphan = events.find((e) => e.type === "wake_window" && e.lifecycle.state === "recorded");
    if (orphan) {
      return `R4.2 invariant violated: recorded wake_window ${orphan.id} (eventKey ${orphan.eventKey}) survived R4.2 merge. R3.1's matches predicate assumes these are dropped after R4.2 runs.`;
    }
    return null;
  },
};

export const RULES: Rule[] = [RuleApplyWakeWindowOverrides];
