/**
 * Rules engine evaluator: topo-sorts rules by `dependsOn`, iterates to a
 * fixed point, and enforces the reality-wins axiom (no rule may mutate a
 * recorded/completed event).
 */

import { isRecorded, NO_OWNER, type Context, type Event, type Lifecycle } from "../schemas";
import { recordedLifecycle } from "../lifecycle";

// ---------------------------------------------------------------------------
// Rule shape
// ---------------------------------------------------------------------------

export type Rule = {
  /** Stable id matching a REQUIREMENTS.md rule (e.g. "R3.1"). */
  id: string;
  /** Human-readable; surfaces in error messages and dev-mode traces. */
  description: string;
  /** Other rule ids that must observe their own output before this rule runs. */
  dependsOn?: string[];
  /** Pattern match on the current event set + context. False short-circuits. */
  matches: (events: Event[], ctx: Context) => boolean;
  /** Produce a transformed event set. Must be pure. */
  produces: (events: Event[], ctx: Context) => Event[];
  /** Optional invariant assertion. Return null on pass; string on fail (becomes the error message). */
  assertAfter?: (events: Event[], ctx: Context) => string | null;
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class EvaluationError extends Error {
  readonly ruleId: string;
  readonly events: Event[];

  constructor(ruleId: string, message: string, events: Event[]) {
    super(`[${ruleId}] ${message}`);
    this.name = "EvaluationError";
    this.ruleId = ruleId;
    this.events = events;
  }
}

// ---------------------------------------------------------------------------
// Topological sort
// ---------------------------------------------------------------------------

/** Order rules by `dependsOn`; throws on unknown deps or cycles. */
export function topoSort(rules: Rule[]): Rule[] {
  const byId = new Map<string, Rule>();
  for (const rule of rules) {
    if (byId.has(rule.id)) {
      throw new Error(`Duplicate rule id: ${rule.id}`);
    }
    byId.set(rule.id, rule);
  }

  for (const rule of rules) {
    for (const depId of rule.dependsOn ?? []) {
      if (!byId.has(depId)) {
        throw new Error(`Rule ${rule.id} depends on unknown rule id: ${depId}`);
      }
    }
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const ordered: Rule[] = [];

  function visit(rule: Rule) {
    if (visited.has(rule.id)) return;
    if (visiting.has(rule.id)) {
      throw new Error(`Cycle detected in rule dependencies through ${rule.id}`);
    }
    visiting.add(rule.id);
    for (const depId of rule.dependsOn ?? []) {
      const dep = byId.get(depId);
      if (dep) visit(dep);
    }
    visiting.delete(rule.id);
    visited.add(rule.id);
    ordered.push(rule);
  }

  for (const rule of rules) visit(rule);
  return ordered;
}

// ---------------------------------------------------------------------------
// Reality-wins guard
// ---------------------------------------------------------------------------

/**
 * Asserts recorded events pass through a rule unmodified.
 * wake_window events are excluded even when recorded — R4.2 intentionally
 * drops recorded wake_window docs after merging their owner annotation.
 */
function checkRealityWins(ruleId: string, before: Event[], after: Event[]): void {
  const beforeRecorded = before.filter((e) => isRecorded(e.lifecycle) && e.type !== "wake_window");
  const afterById = new Map(after.map((e) => [e.id, e]));

  for (const recorded of beforeRecorded) {
    const next = afterById.get(recorded.id);
    if (!next) {
      throw new EvaluationError(
        ruleId,
        `removed recorded event ${recorded.eventKey} (${recorded.id})`,
        after,
      );
    }
    if (!isRecorded(next.lifecycle)) {
      throw new EvaluationError(
        ruleId,
        `downgraded recorded event ${recorded.eventKey} from ${recorded.lifecycle.state} to ${next.lifecycle.state}`,
        after,
      );
    }
    if (!recordedFieldsMatch(recorded, next)) {
      throw new EvaluationError(
        ruleId,
        `mutated recorded event ${recorded.eventKey} (${recorded.id}): time/owner/amount changed`,
        after,
      );
    }
  }
}

/** Checks identity of fields that are frozen after recording; label/hasPutdown may be re-derived. */
function recordedFieldsMatch(a: Event, b: Event): boolean {
  if (a.type !== b.type) return false;
  if (a.startTime !== b.startTime) return false;
  if (a.endTime !== b.endTime) return false;
  if (a.amountOz !== b.amountOz) return false;
  if (!sameOwner(a.owner, b.owner)) return false;
  if (!sameLifecycle(a.lifecycle, b.lifecycle)) return false;
  return true;
}

function sameOwner(a: Event["owner"], b: Event["owner"]): boolean {
  // Coerce undefined (legacy data) to NO_OWNER so pre-existing events don't crash before the defaulter runs.
  const aRef = a ?? NO_OWNER;
  const bRef = b ?? NO_OWNER;
  if (aRef.slot !== bRef.slot) return false;
  if (aRef.slot === "other" && bRef.slot === "other") {
    return aRef.otherId === bRef.otherId;
  }
  return true;
}

function sameLifecycle(a: Lifecycle, b: Lifecycle): boolean {
  if (a.state !== b.state) return false;
  if (a.state === "completed" && b.state === "completed") {
    return a.committedAt === b.committedAt;
  }
  if (a.state === "recorded" && b.state === "recorded") {
    return a.annotatedAt === b.annotatedAt;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Structural equality (fixed-point detection)
// ---------------------------------------------------------------------------

function eventsEqual(a: Event[], b: Event[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!shallowEventEqual(a[i]!, b[i]!)) return false;
  }
  return true;
}

function shallowEventEqual(a: Event, b: Event): boolean {
  return (
    a.id === b.id &&
    a.eventKey === b.eventKey &&
    a.type === b.type &&
    a.kind === b.kind &&
    a.startTime === b.startTime &&
    a.endTime === b.endTime &&
    a.label === b.label &&
    a.amountOz === b.amountOz &&
    a.hasPutdown === b.hasPutdown &&
    sameOwner(a.owner, b.owner) &&
    sameLifecycle(a.lifecycle, b.lifecycle)
  );
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

export const MAX_PASSES = 16;

export type EvaluateOptions = {
  /** Override the safety cap; tests use lower values to exercise non-convergence. */
  maxPasses?: number;
};

/** Iterate rules to a fixed point; returns events sorted by startTime. */
export function evaluate(rules: Rule[], ctx: Context, options: EvaluateOptions = {}): Event[] {
  const ordered = topoSort(rules);
  const maxPasses = options.maxPasses ?? MAX_PASSES;

  let events: Event[] = [...ctx.actuals];

  let pass = 0;
  while (pass < maxPasses) {
    let changed = false;
    for (const rule of ordered) {
      if (!rule.matches(events, ctx)) continue;
      const next = rule.produces(events, ctx);
      checkRealityWins(rule.id, events, next);
      if (!eventsEqual(events, next)) {
        events = next;
        changed = true;
        if (rule.assertAfter) {
          const err = rule.assertAfter(events, ctx);
          if (err) throw new EvaluationError(rule.id, err, events);
        }
      }
    }
    if (!changed) break;
    pass++;
  }

  if (pass >= maxPasses) {
    throw new EvaluationError(
      "CONVERGENCE",
      `rules did not stabilize within ${maxPasses} passes`,
      events,
    );
  }

  // Now-cross auto-promote: projected events whose startTime ≤ nowMinutes
  // flip to recorded so downstream rules and the render layer treat them
  // as committed reality.
  events = events.map((e) =>
    e.lifecycle.state === "projected" && e.startTime <= ctx.nowMinutes
      ? { ...e, lifecycle: recordedLifecycle(e.startTime) }
      : e,
  );

  return [...events].sort((a, b) => a.startTime - b.startTime);
}
