/**
 * R6.x — Putdown rules (render-only flag).
 *
 * Source: docs/v3/ENGINE_SPEC.md §6.
 *
 * R6.1: putdown is purely predictive — never recorded, never persisted.
 * The engine sets `hasPutdown: true` on naps and bedtimes whose lifecycle
 * still points to a future moment (`projected` or `recorded`). The
 * renderer (`expandPutdownBlocks`) further gates by `nowMinutes` — R6.7
 * suppresses the synthetic when the moment has passed in real time.
 *
 * Why both `projected` AND `recorded`: a user-anchored nap (e.g. drawer
 * time-edit, owner annotation) has `lifecycle.state === "recorded"` but
 * the putdown window may still be in the future. The putdown is still
 * relevant. The pre-fix code only allowed `projected`, so owner edits
 * silently killed the putdown block.
 *
 * Why NOT `completed`: completed events represent past reality. On an
 * archived-day read (renderer's `nowMinutes` unavailable), the renderer
 * would otherwise inject phantom putdown visuals around historical events.
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
  return state === "projected" || state === "recorded";
}

export const RULES: Rule[] = [RuleSetHasPutdown];
