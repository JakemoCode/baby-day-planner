/**
 * R11.x — Daily recurring event rules.
 *
 * Source: docs/v3/ENGINE_SPEC.md §11.
 *
 * Implemented here:
 *   R11.1 — Settings.dailyRecurring is the source of truth.
 *   R11.2 — each enabled entry projects one event with eventKey
 *           `recurring:{id}`; durationMinutes > 0 → block, else instant.
 *   R11.5 — existing event at the same eventKey suppresses projection.
 *   R11.6 — ids in Day.suppressedRecurringIds are skipped for that day.
 *
 * Out-of-scope here (handled elsewhere):
 *   R11.3 — drawer / overlap / validation behavior is a UI concern,
 *           Phase 3.
 *   R11.4 — multiple recurring events of any combination — emergent
 *           from R11.2 plus the tests below.
 *
 * Known gap (deferred to R12 owners work):
 *   defaultOwnerSlot is typed `OwnerSlot = parent1 | parent2`. The spec
 *   contemplates "other" caregivers as default owners, but expressing
 *   that requires widening the schema (an `OwnerRef` instead of an
 *   `OwnerSlot`). Out of scope for this rule — track with R12.
 */

import type { Context, DailyRecurring as RecurringConfig, Event } from "../../schemas";
import type { Rule } from "../evaluator";
import { hasType, projectedEvent } from "../helpers";

const isRecurring = hasType("daily_recurring");

const RuleProjectDailyRecurring: Rule = {
  id: "R11.2",
  description: "Project a daily_recurring event for each enabled, non-suppressed setting entry",
  // Cheap pre-filter: if no entry is enabled and not suppressed, the rule
  // can short-circuit without the eventKey scan. The full dedup work
  // happens once inside `produces`.
  matches: (events, ctx) =>
    ctx.settings.dailyRecurring.some(
      (e) => e.enabled && !ctx.day.suppressedRecurringIds.includes(e.id),
    ),
  produces: (events, ctx) => {
    const missing = missingRecurring(events, ctx);
    if (missing.length === 0) return events;
    return [...events, ...missing.map((entry) => buildProjection(ctx, entry))];
  },
};

function missingRecurring(events: readonly Event[], ctx: Context): RecurringConfig[] {
  const suppressed = new Set(ctx.day.suppressedRecurringIds);
  // Includes recorded events intentionally — R11.5: a recorded
  // daily_recurring with this key means reality already happened; the
  // §0 reality-wins axiom requires we leave it untouched.
  const existingKeys = new Set(events.filter(isRecurring).map((e) => e.eventKey));
  // Defensive id-dedup (settings UI should prevent duplicates, but a
  // malformed Firestore doc shouldn't double-emit). First entry wins.
  const seenIds = new Set<string>();
  const out: RecurringConfig[] = [];
  for (const entry of ctx.settings.dailyRecurring) {
    if (!entry.enabled) continue;
    if (suppressed.has(entry.id)) continue;
    if (seenIds.has(entry.id)) continue;
    if (existingKeys.has(recurringKey(entry.id))) {
      seenIds.add(entry.id); // mark so a duplicate later doesn't slip through
      continue;
    }
    seenIds.add(entry.id);
    out.push(entry);
  }
  return out;
}

function buildProjection(ctx: Context, entry: RecurringConfig): Event {
  const eventKey = recurringKey(entry.id);
  // R11.2: durationMinutes > 0 → block. Treat 0 (or undefined) as
  // instant; a zero-length block is nonsensical and would render
  // weirdly.
  const isBlock = entry.durationMinutes !== undefined && entry.durationMinutes > 0;
  const ownerSlot = entry.defaultOwnerSlot;
  return projectedEvent({
    ctx,
    id: `proj_${eventKey}`,
    eventKey,
    type: "daily_recurring",
    kind: isBlock ? "block" : "instant",
    startTime: entry.time,
    label: entry.label,
    ...(isBlock ? { endTime: entry.time + entry.durationMinutes! } : {}),
    ...(ownerSlot !== undefined ? { owner: { slot: ownerSlot } } : {}),
  });
}

function recurringKey(id: string): string {
  return `recurring:${id}`;
}

export const RULES: Rule[] = [RuleProjectDailyRecurring];
