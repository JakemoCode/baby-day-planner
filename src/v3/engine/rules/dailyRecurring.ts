/**
 * R11.x daily recurring event rules. Source: docs/v3/ENGINE_SPEC.md §11.
 * Projects one event per enabled, non-suppressed dailyRecurring entry; an
 * existing event at the same eventKey (R11.5) or a suppressed id (R11.6) blocks it.
 *
 * Known gap (deferred to R12 owners work): defaultOwnerSlot is `parent1 | parent2`;
 * supporting "other" caregivers as default owners needs an `OwnerRef`, not an `OwnerSlot`.
 */

import type { Context, DailyRecurring as RecurringConfig, Event } from "../../schemas";
import type { Rule } from "../evaluator";
import { hasType, projectedEvent } from "../helpers";
import { missingScheduledEvents } from "./missingScheduledEvents";
import { recurringEventKeyFor } from "../../lib/eventConventions";

const isRecurring = hasType("daily_recurring");

const RuleProjectDailyRecurring: Rule = {
  id: "R11.2",
  description: "Project a daily_recurring event for each enabled, non-suppressed setting entry",
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
  const seenIds = new Set<string>(); // dedup in case of malformed Firestore doc; first entry wins
  const candidates: Array<RecurringConfig & { eventKey: string }> = [];
  for (const entry of ctx.settings.dailyRecurring) {
    if (!entry.enabled) continue;
    if (suppressed.has(entry.id)) continue;
    if (seenIds.has(entry.id)) continue;
    seenIds.add(entry.id);
    candidates.push({ ...entry, eventKey: recurringEventKeyFor(entry.id) });
  }
  // R11.5: recorded and projected events both suppress projection (reality wins).
  return missingScheduledEvents(candidates, events.filter(isRecurring));
}

function buildProjection(ctx: Context, entry: RecurringConfig): Event {
  const eventKey = recurringEventKeyFor(entry.id);
  // durationMinutes > 0 → block; 0 or undefined → instant (zero-length block is nonsensical).
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

export const RULES: Rule[] = [RuleProjectDailyRecurring];
