/**
 * R6.x — Putdown rules (render-only flag).
 *
 * Source: docs/v3/REQUIREMENTS.md §6.
 *
 * R6.1: putdown is purely predictive — never recorded, never persisted.
 * The engine sets `hasPutdown: true` on projected naps and bedtime that
 * are still in the future. The renderer prepends a virtual putdown block
 * for any event with `hasPutdown === true`.
 *
 * R6.2: derived from the parent event; no separate Firestore doc.
 * R6.7: suppressed when the moment has passed (startTime <= nowMinutes).
 */

import type { Event } from "../../schemas";
import type { Rule } from "../evaluator";
import { isProjected } from "../helpers";

const RuleSetHasPutdown: Rule = {
  id: "R6.1",
  description: "Set hasPutdown=true on projected nap/bedtime events still in the future",
  matches: (events, ctx) =>
    events.some((e) => deriveHasPutdown(e, ctx.nowMinutes) !== e.hasPutdown),
  produces: (events, ctx) =>
    events.map((e) => {
      const target = deriveHasPutdown(e, ctx.nowMinutes);
      if (target === e.hasPutdown) return e;
      return { ...e, hasPutdown: target };
    }),
};

function deriveHasPutdown(e: Event, nowMinutes: number): boolean {
  if (e.type !== "nap" && e.type !== "bedtime") return false;
  if (!isProjected(e)) return false;
  return e.startTime > nowMinutes;
}

export const RULES: Rule[] = [RuleSetHasPutdown];
