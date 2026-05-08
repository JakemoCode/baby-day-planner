/**
 * V3 public exports.
 *
 * Phase 1 surface: types + engine entry point + lifecycle reducer.
 * No UI or React surface ships in Phase 1 — V2 stays wired everywhere.
 */

export type {
  AllowlistDoc,
  BottleAmountRule,
  BottleChainConfig,
  Context,
  DailyRecurring,
  Day,
  DayStatus,
  DaycareConfig,
  Event,
  EventKind,
  EventType,
  Lifecycle,
  OwnerRef,
  OwnerSlot,
  OwnersConfig,
  OwnershipTemplate,
  ProjectInput,
  Settings,
  TimeMin,
  Weekday,
  WeekdayFlags,
} from "./schemas";

export { isRecorded, ownerRefEquals } from "./schemas";

export { reduceLifecycle, LifecycleTransitionError, type LifecycleAction } from "./lifecycle";

export {
  evaluate,
  topoSort,
  EvaluationError,
  MAX_PASSES,
  type EvaluateOptions,
  type Rule,
} from "./engine/evaluator";

export { projectDay, type ProjectDayOptions } from "./engine/projectDay";

export { ALL_RULES } from "./engine/rules";
