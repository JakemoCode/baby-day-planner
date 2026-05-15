/**
 * R9.x — Pump rules.
 *
 * Source: docs/v3/ENGINE_SPEC.md §9.
 *
 * R9.1: emit a projected pump for each entry in `settings.pumpTimes`.
 * R9.2: eventKey is `pump_${HH:MM}` (time encoded for dedupe — R9.4).
 * R9.3: first entry is anchored to `day.wakeTime` (overriding the setting)
 *       so nursing parents don't have to update settings every morning.
 * R9.4: actuals with the same eventKey suppress the projection.
 * R9.5: kind = block; duration = settings.defaultPumpDurationMinutes.
 *       Pumping is a 20–30 min activity that blocks the owner from
 *       other concurrent tasks (e.g. mom pumping can't do dream feed),
 *       so render as a duration block in the right column.
 *
 * Owner default = `settings.pumpOwnerSlot`.
 */

import type { Context, Event, TimeMin } from "../../schemas";
import type { Rule } from "../evaluator";
import { hasType, projectedEvent } from "../helpers";

const isPump = hasType("pump");

const RuleProjectPumps: Rule = {
  id: "R9.1",
  description: "Project a pump instant for each settings.pumpTimes entry",
  matches: (events, ctx) => missingPumps(events, ctx).length > 0,
  produces: (events, ctx) => {
    const missing = missingPumps(events, ctx);
    if (missing.length === 0) return events;
    return [...events, ...missing.map((t) => buildProjectedPump(ctx, t.startTime, t.eventKey))];
  },
};

type PumpTarget = { startTime: TimeMin; eventKey: string };

/**
 * R9.3: first pump anchored to day.wakeTime when present. The remaining
 * settings entries flow through unchanged.
 *
 * R9.4: filter out targets whose eventKey already exists on a pump event
 * (recorded or projected) so we never emit duplicates.
 *
 * Targets are also internally deduped by eventKey: two settings entries
 * with the same time, or a wake-anchored first entry colliding with a
 * later setting (e.g. wakeTime equals pumpTimes[1]), would otherwise
 * project two events with identical ids.
 */
function missingPumps(events: readonly Event[], ctx: Context): PumpTarget[] {
  const times = ctx.settings.pumpTimes;
  if (times.length === 0) return [];
  const existingKeys = new Set(events.filter(isPump).map((e) => e.eventKey));
  const anchored: TimeMin[] =
    ctx.day.wakeTime !== undefined ? [ctx.day.wakeTime, ...times.slice(1)] : [...times];
  const seen = new Set<string>();
  const targets: PumpTarget[] = [];
  for (const t of anchored) {
    const eventKey = pumpEventKey(t);
    if (existingKeys.has(eventKey)) continue;
    if (seen.has(eventKey)) continue;
    seen.add(eventKey);
    targets.push({ startTime: t, eventKey });
  }
  return targets;
}

/** Format a TimeMin as `pump_HH:MM` (zero-padded, 24-hour, cross-day safe). */
function pumpEventKey(time: TimeMin): string {
  const hours = Math.floor(time / 60);
  const minutes = time % 60;
  return `pump_${pad2(hours)}:${pad2(minutes)}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function buildProjectedPump(ctx: Context, startTime: TimeMin, eventKey: string): Event {
  return projectedEvent({
    ctx,
    id: `proj_${eventKey}`,
    eventKey,
    type: "pump",
    kind: "block",
    startTime,
    endTime: startTime + ctx.settings.defaultPumpDurationMinutes,
    label: "Pump",
    owner: { slot: ctx.settings.pumpOwnerSlot },
  });
}

export const RULES: Rule[] = [RuleProjectPumps];
