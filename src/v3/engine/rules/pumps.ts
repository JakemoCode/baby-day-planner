/**
 * R9.1 — Project a pump block for each settings.pumpTimes entry.
 * First entry anchors to day.wakeTime (R9.3). Eventkey = pump_HH:MM (R9.2).
 * Existing event with same key suppresses projection (R9.4).
 */

import type { Context, Event, TimeMin } from "../../schemas";
import type { Rule } from "../evaluator";
import { hasType, projectedEvent } from "../helpers";
import { missingScheduledEvents } from "./missingScheduledEvents";

const isPump = hasType("pump");

const RuleProjectPumps: Rule = {
  id: "R9.1",
  description: "Project a pump instant for each settings.pumpTimes entry",
  matches: (events, ctx) => missingPumps(events, ctx).length > 0,
  produces: (events, ctx) => {
    const missing = missingPumps(events, ctx);
    if (missing.length === 0) return events;
    return [
      ...events,
      ...missing.map((t) => buildProjectedPump(ctx, t.startTime, t.eventKey, t.durationMinutes)),
    ];
  },
};

type PumpTarget = { startTime: TimeMin; eventKey: string; durationMinutes?: number };

/**
 * Builds candidate pump targets (R9.3 wake-anchor on first entry, R9.4 dedup by eventKey)
 * then filters out any whose key already exists in the event pool.
 */
function missingPumps(events: readonly Event[], ctx: Context): PumpTarget[] {
  const sessions = ctx.settings.pumpTimes;
  if (sessions.length === 0) return [];
  const anchored = sessions.map((s, i) => {
    if (i === 0 && ctx.day.wakeTime !== undefined) {
      return { ...s, time: ctx.day.wakeTime };
    }
    return s;
  });
  // Dedup by eventKey (first occurrence wins) in case of time collision.
  const seen = new Set<string>();
  const candidates: PumpTarget[] = [];
  for (const s of anchored) {
    const eventKey = pumpEventKey(s.time);
    if (seen.has(eventKey)) continue;
    seen.add(eventKey);
    candidates.push({
      startTime: s.time,
      eventKey,
      ...(s.durationMinutes !== undefined ? { durationMinutes: s.durationMinutes } : {}),
    });
  }
  return missingScheduledEvents(candidates, events.filter(isPump));
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

function buildProjectedPump(
  ctx: Context,
  startTime: TimeMin,
  eventKey: string,
  durationOverride?: number,
): Event {
  const duration = durationOverride ?? ctx.settings.defaultPumpDurationMinutes;
  return projectedEvent({
    ctx,
    id: `proj_${eventKey}`,
    eventKey,
    type: "pump",
    kind: "block",
    startTime,
    endTime: startTime + duration,
    label: "Pump",
    owner: { slot: ctx.settings.pumpOwnerSlot },
  });
}

export const RULES: Rule[] = [RuleProjectPumps];
