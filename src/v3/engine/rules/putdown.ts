/**
 * R6.x — Putdown rules (render-only flag).
 *
 * Source: docs/v3/REQUIREMENTS.md §6.
 *
 * R6.1: putdown is purely predictive — never recorded, never persisted.
 * The engine sets `hasPutdown: true` on every nap and bedtime, regardless
 * of lifecycle. The renderer (`expandPutdownBlocks`) decides whether to
 * inject the synthetic block based on whether the event is still in the
 * future (R6.7 — suppress when the moment has passed).
 *
 * Why the engine doesn't gate by lifecycle: an owner-only drawer edit
 * transitions a projected nap to `overridden`, which is still a
 * time-preserving annotation pointing to a future event. The putdown
 * window is still relevant. Bundling the temporal gate with lifecycle
 * dropped that case. The renderer owns "is this still in the future"
 * because it owns time.
 *
 * R6.2: derived from the parent event; no separate Firestore doc.
 */

import type { Event } from "../../schemas";
import type { Rule } from "../evaluator";

const RuleSetHasPutdown: Rule = {
  id: "R6.1",
  description: "Set hasPutdown=true on every nap and bedtime event (renderer gates temporally)",
  matches: (events) => events.some((e) => deriveHasPutdown(e) !== e.hasPutdown),
  produces: (events) =>
    events.map((e) => {
      const target = deriveHasPutdown(e);
      if (target === e.hasPutdown) return e;
      return { ...e, hasPutdown: target };
    }),
};

function deriveHasPutdown(e: Event): boolean {
  return e.type === "nap" || e.type === "bedtime";
}

export const RULES: Rule[] = [RuleSetHasPutdown];
