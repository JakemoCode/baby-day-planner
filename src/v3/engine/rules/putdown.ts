/**
 * R6.1 — Sets hasPutdown=true on naps/bedtimes with lifecycle projected or recorded.
 * `completed` is excluded: past events must not produce phantom putdown visuals.
 * Renderer gates further by nowMinutes.
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
