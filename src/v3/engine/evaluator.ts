/**
 * Rules engine evaluator.
 *
 * Source: docs/v3/ARCHITECTURE_V3.md §2.
 *
 * Properties:
 * - Deterministic (CC2): same input → same output.
 * - Bounded: MAX_PASSES safety net; rules cycle in finite passes or throw.
 * - Loud failure: assertAfter and the §0 reality-wins guard throw with the
 *   offending rule id and a snapshot of the event state.
 * - Order from data: rules declare `dependsOn` ids; the evaluator topo-sorts.
 *
 * The reality-wins axiom (§2.0):
 *   No rule may add, remove, or mutate any event whose lifecycle.state is
 *   `recorded` or `completed`. The safeProduces wrapper enforces this by
 *   diffing recorded events before/after each rule run.
 */

import { isRecorded, NO_OWNER, type Context, type Event, type Lifecycle } from "../schemas";

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

/**
 * Order rules so that each rule's `dependsOn` ids precede it. Throws on
 * unknown dependencies or cycles — both are configuration bugs that should
 * surface at startup, not at evaluation time.
 */
export function topoSort(rules: Rule[]): Rule[] {
  const byId = new Map<string, Rule>();
  for (const rule of rules) {
    if (byId.has(rule.id)) {
      throw new Error(`Duplicate rule id: ${rule.id}`);
    }
    byId.set(rule.id, rule);
  }

  // Validate that every dependsOn id resolves.
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
 * A recorded event is identified by (id, lifecycle-state). The guard checks
 * that the set of recorded events emerges from a rule unchanged: same ids,
 * same lifecycle state for each, no removals, no rewrites of recorded fields.
 *
 * wake_window events are excluded from this guard even when their lifecycle is
 * `recorded` — they are engine projection artifacts used to carry scheduling
 * metadata (owner annotations). R4.2 intentionally drops them after merging
 * their metadata onto the cascade-derived projection.
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

/**
 * Recorded events have authoritative type, time, owner, and payload.
 * Display fields (label, hasPutdown) MAY be re-derived by rules. eventKey
 * is also mutable (R5.4 chronological renumber rewrites recorded bottle keys).
 */
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
  // §F37: owner is required and uses { slot: "none" } for unassigned.
  // Belt-and-suspenders: coerce `undefined` (legacy data, untyped
  // fixtures) to NO_OWNER so a pre-F37 in-memory event doesn't crash
  // the evaluator before the read-seam defaulter runs.
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
// Structural equality (for fixed-point detection)
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

/**
 * Iterate rules to a fixed point. Returns events sorted by startTime.
 * Throws EvaluationError if convergence fails or any rule asserts false.
 */
export function evaluate(rules: Rule[], ctx: Context, options: EvaluateOptions = {}): Event[] {
  const ordered = topoSort(rules);
  const maxPasses = options.maxPasses ?? MAX_PASSES;

  // Reality-wins axiom: actuals enter the events array unchanged.
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

  return [...events].sort((a, b) => a.startTime - b.startTime);
}
