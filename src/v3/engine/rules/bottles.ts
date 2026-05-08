/**
 * R5.x — Bottle rules.
 *
 * Source: docs/v3/REQUIREMENTS.md §5.
 */

import { isRecorded, type Context, type Event } from "../../schemas";
import type { Rule } from "../evaluator";

/**
 * R5.11 — Project bottle placeholders up to settings.bottleChain.bottlesPerDay.
 *
 * Anchoring (per the resolved R5.10/R5.11 spec):
 * - With zero recorded bottles, the first placeholder lands at
 *   `Day.wakeTime + bottleChain.bufferAfterWakeMinutes`. Subsequent
 *   placeholders cascade at `defaultBottleIntervalMinutes` until
 *   `bottlesPerDay` total exist.
 * - With one or more recorded bottles, R5.1 takes over: cascade resumes
 *   from the latest recorded bottle's startTime. (Implemented in a
 *   subsequent rule.)
 *
 * Recorded bottles are never touched. The reality-wins guard would
 * throw if this rule mutated one.
 */
const RuleProjectBottlePlaceholders: Rule = {
  id: "R5.11",
  description:
    "Project bottle placeholders up to bottlesPerDay, anchored at wake + buffer when no recordings yet",
  matches: (events, ctx) => {
    if (ctx.day.wakeTime === undefined) return false;
    const bottlesProjected = events.some(
      (e) => e.type === "bottle" && e.lifecycle.state === "projected",
    );
    const bottlesRecorded = events.some(
      (e) =>
        e.type === "bottle" &&
        (e.lifecycle.state === "started" || e.lifecycle.state === "completed"),
    );
    // Fire only when no bottles of any kind exist yet — placeholders
    // need a clean slate. Once recordings land, R5.1 owns the cascade.
    return !bottlesProjected && !bottlesRecorded;
  },
  produces: (events, ctx) => projectPlaceholders(ctx, events),
};

function projectPlaceholders(ctx: Context, existing: Event[]): Event[] {
  const wakeTime = ctx.day.wakeTime;
  if (wakeTime === undefined) return existing;

  const { bottlesPerDay, bufferAfterWakeMinutes } = ctx.settings.bottleChain;
  const interval = ctx.settings.defaultBottleIntervalMinutes;

  const placeholders: Event[] = [];
  for (let i = 0; i < bottlesPerDay; i++) {
    const start = wakeTime + bufferAfterWakeMinutes + i * interval;
    const n = i + 1;
    placeholders.push({
      id: `proj_bottle_${n}`,
      dayId: ctx.day.id,
      eventKey: `bottle_${n}`,
      type: "bottle",
      kind: "instant",
      startTime: start,
      label: `Bottle ${n}`,
      hasPutdown: false,
      lifecycle: { state: "projected" },
      amountOz: ctx.settings.defaultBottleAmountOz,
    });
  }

  return [...existing, ...placeholders];
}

/**
 * R5.1 — Once at least one bottle has been recorded, the cascade resumes
 * from the LATEST recorded bottle (by startTime). Projected bottles fill
 * in until the total bottle count meets `bottlesPerDay`.
 *
 * Recorded bottles are never moved or removed (reality wins, §0).
 *
 * Depends on R5.11 only by ordering — once a recording lands, R5.11 stops
 * firing (its match condition is "no bottles of any kind"), and R5.1
 * takes over.
 */
const RuleCascadeFromLatestRecorded: Rule = {
  id: "R5.1",
  description: "Cascade additional projected bottles from the latest recorded bottle",
  matches: (events, ctx) => {
    const bottles = events.filter((e) => e.type === "bottle");
    const hasRecorded = bottles.some((b) => isRecorded(b.lifecycle));
    if (!hasRecorded) return false;
    return bottles.length < ctx.settings.bottleChain.bottlesPerDay;
  },
  produces: (events, ctx) => cascadeFromLatest(ctx, events),
};

function cascadeFromLatest(ctx: Context, existing: Event[]): Event[] {
  const bottles = existing.filter((e) => e.type === "bottle");
  const hasRecorded = bottles.some((b) => isRecorded(b.lifecycle));
  if (!hasRecorded) return existing;

  // Cascade from the latest bottle of ANY kind. The chain may already
  // include projections downstream of a recorded anchor; we extend from
  // the tip, not from the recorded anchor itself, so we don't re-emit
  // at the same times on subsequent evaluator passes.
  const latest = bottles.reduce((max, b) => (b.startTime > max.startTime ? b : max));

  const target = ctx.settings.bottleChain.bottlesPerDay;
  const interval = ctx.settings.defaultBottleIntervalMinutes;
  const needed = target - bottles.length;
  if (needed <= 0) return existing;

  // Find the highest existing eventKey index so new keys don't collide
  // (R5.3 — index from MAX, not latest-by-time).
  const maxIndex = bottles.reduce((m, b) => {
    const match = /^bottle_(\d+)$/.exec(b.eventKey);
    if (!match) return m;
    return Math.max(m, parseInt(match[1]!, 10));
  }, 0);

  // R5.8: cascade stops when the next projected start would land at or
  // after tomorrow's defaultWakeTime. After that point, the bottle
  // belongs to tomorrow, not today.
  const tomorrowWake = ctx.settings.defaultWakeTime + 24 * 60;

  const projections: Event[] = [];
  for (let i = 1; i <= needed; i++) {
    const start = latest.startTime + i * interval;
    if (start >= tomorrowWake) break; // R5.8
    const n = maxIndex + i;
    projections.push({
      id: `proj_bottle_${n}`,
      dayId: ctx.day.id,
      eventKey: `bottle_${n}`,
      type: "bottle",
      kind: "instant",
      startTime: start,
      label: `Bottle ${n}`,
      hasPutdown: false,
      lifecycle: { state: "projected" },
      amountOz: ctx.settings.defaultBottleAmountOz,
    });
  }

  return [...existing, ...projections];
}

/**
 * R5.4 — Bottles are renumbered chronologically for display.
 *
 * After cascade and overlap resolution, the engine sorts bottles by
 * startTime and rewrites eventKey/label as `bottle_1`, `bottle_2`, etc.
 * This ensures the timeline shows bottles in monotonic order regardless
 * of how the user inserted them.
 *
 * R5.5: this is engine-side only. Firestore docs keep their original
 * eventKey (the persistence layer reads `id` for lookups, never
 * eventKey). The reality-wins guard allows this rewrite because eventKey
 * and label are display fields, not authoritative recorded fields.
 */
const RuleRenumberBottlesChronologically: Rule = {
  id: "R5.4",
  description: "Renumber bottle eventKey/label chronologically for display",
  dependsOn: ["R5.1", "R5.11"],
  matches: (events) => {
    const bottles = events
      .filter((e) => e.type === "bottle")
      .sort((a, b) => a.startTime - b.startTime);
    return bottles.some((b, i) => b.eventKey !== `bottle_${i + 1}`);
  },
  produces: (events) => {
    const ordered = [...events].filter((e) => e.type === "bottle");
    ordered.sort((a, b) => a.startTime - b.startTime);
    const renamed = new Map<string, { eventKey: string; label: string }>();
    ordered.forEach((b, i) => {
      const n = i + 1;
      renamed.set(b.id, { eventKey: `bottle_${n}`, label: `Bottle ${n}` });
    });
    return events.map((e) => {
      if (e.type !== "bottle") return e;
      const next = renamed.get(e.id);
      if (!next) return e;
      if (e.eventKey === next.eventKey && e.label === next.label) return e;
      return { ...e, eventKey: next.eventKey, label: next.label };
    });
  },
};

export const RULES: Rule[] = [
  RuleProjectBottlePlaceholders,
  RuleCascadeFromLatestRecorded,
  RuleRenumberBottlesChronologically,
];
