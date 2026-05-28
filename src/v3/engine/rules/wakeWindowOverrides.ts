/**
 * R4.2 — Merges recorded wake_window owner/label annotations onto cascade
 * projections, then drops the annotation doc. Time never flows from the
 * override (predict-don't-prescribe). Stray overrides with no matching
 * projection are silently dropped.
 */

import type { Event } from "../../schemas";
import type { Rule } from "../evaluator";
import { isProjected, isWakeWindow } from "../helpers";

function isWakeWindowOverride(e: Event): boolean {
  return isWakeWindow(e) && e.lifecycle.state === "recorded";
}

const RuleApplyWakeWindowOverrides: Rule = {
  id: "R4.2",
  description: "Merge wake_window owner/label overrides onto projections; drop the override docs",
  // dependsOn R12.3 so override beats template (topo-order, not array-order).
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
      const next: Event = { ...e, owner: override.owner }; // §F37: unassigned = { slot: "none" }, not omitted
      if (override.label) next.label = override.label;
      return [next];
    });
  },
  // assertAfter guards R3.1's assumption that no recorded wake_windows survive R4.2.
  assertAfter: (events) => {
    const orphan = events.find((e) => e.type === "wake_window" && e.lifecycle.state === "recorded");
    if (orphan) {
      return `R4.2 invariant violated: recorded wake_window (eventKey ${orphan.eventKey}) survived R4.2 merge. R3.1's matches predicate assumes these are dropped after R4.2 runs.`;
    }
    return null;
  },
};

export const RULES: Rule[] = [RuleApplyWakeWindowOverrides];
