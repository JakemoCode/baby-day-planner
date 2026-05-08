/**
 * V3 public API: project a day into a sorted Event list.
 *
 * Signature mirrors V2's `projectDay` so cutover at the UI surface is a
 * one-line change (Phase 3).
 *
 * Source: docs/v3/ARCHITECTURE_V3.md §3.
 */

import type { Context, Event, ProjectInput } from "../schemas";
import { evaluate, type Rule } from "./evaluator";
import { ALL_RULES } from "./rules";

/**
 * Default `nowMinutes` when the caller doesn't pass one. 24*60 = end of day,
 * which matches V2's "evaluate as if the day is over" semantics for batch
 * recompute.
 */
const DEFAULT_NOW = 24 * 60;

export type ProjectDayOptions = {
  /** Override the rule set (testing). Defaults to ALL_RULES. */
  rules?: Rule[];
};

export function projectDay(input: ProjectInput, options: ProjectDayOptions = {}): Event[] {
  const ctx: Context = {
    day: input.day,
    settings: input.settings,
    actuals: input.actuals,
    nowMinutes: input.nowMinutes ?? DEFAULT_NOW,
    ...(input.template !== undefined ? { template: input.template } : {}),
  };
  return evaluate(options.rules ?? ALL_RULES, ctx);
}
