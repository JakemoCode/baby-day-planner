/**
 * R6.x — Putdown rules (render-only flag).
 *
 * Source: docs/v3/REQUIREMENTS.md §6.
 *
 * R6.1: putdown is purely predictive — never recorded, never persisted.
 * The engine sets `hasPutdown: true` on naps and bedtimes whose lifecycle
 * still points to a future moment (`projected` or `overridden`). The
 * renderer (`expandPutdownBlocks`) further gates by `nowMinutes` — R6.7
 * suppresses the synthetic when the moment has passed in real time.
 *
 * Why both `projected` AND `overridden`: an owner-only drawer edit
 * promotes a projected event to `overridden` (time-preserving annotation).
 * The putdown window is still relevant. The pre-fix code only allowed
 * `projected`, so owner edits silently killed the putdown block.
 *
 * Why NOT `started`/`completed`: those represent reality, not prediction.
 * On an archived-day read (renderer's `nowMinutes` unavailable), the
 * renderer would otherwise inject phantom putdown visuals around
 * historical recorded events.
 *
 * R6.2: derived from the parent event; no separate Firestore doc.
 */

import type { Event } from "../../schemas";
import type { Rule } from "../evaluator";

const RuleSetHasPutdown: Rule = {
  id: "R6.1",
  description:
    "Set hasPutdown=true on naps/bedtimes whose lifecycle still points to a future moment",
  matches: (events) => events.some((e) => deriveHasPutdown(e) !== e.hasPutdown),
  produces: (events) =>
    events.map((e) => {
      const target = deriveHasPutdown(e);
      if (target === e.hasPutdown) return e;
      return { ...e, hasPutdown: target };
    }),
};

function deriveHasPutdown(e: Event): boolean {
  if (e.type !== "nap" && e.type !== "bedtime") return false;
  const state = e.lifecycle.state;
  return state === "projected" || state === "overridden";
}

export const RULES: Rule[] = [RuleSetHasPutdown];
