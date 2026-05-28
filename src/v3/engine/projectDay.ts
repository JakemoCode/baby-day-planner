/** Projects a day into a sorted Event list. */

import type { Context, Event, ProjectInput } from "../schemas";
import { MINUTES_PER_DAY } from "../ui/time";
import { evaluate, type Rule } from "./evaluator";
import { ALL_RULES } from "./rules";

/** End-of-day default — evaluate as if the day is complete. */
const DEFAULT_NOW = MINUTES_PER_DAY;

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
