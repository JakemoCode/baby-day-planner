# Now-cross promotion at engine layer + no retroactive-shift in rules

**Status:** accepted (2026-05-26 course-correction). Supersedes ADR-0004 and ADR-0005. Tightens ADR-0001's "Now-cross promotion" layer placement and replaces ADR-0004's monolithic invariant with two separable concerns.

There are two architecturally distinct phenomena that ADRs 0004/0005
conflated into one. They get separate mechanisms:

**Concern A — Time moves forward.** A projected event's `startTime`
becomes `≤ nowMinutes` because the wall clock progressed. The engine
performs **Now-cross auto-promote** at the engine layer (post-cascade,
pre-render): any projected event with `startTime ≤ nowMinutes` flips
to `lifecycle.state === "recorded"`. The user lives in reality and
may not have logged the event yet — promotion claims the engine's
best guess, and the user reconciles by deleting if it didn't happen
(the same "lie risk" Jake accepted in the original 2026-05-25 grill).

**Concern B — A recalculation would retroactively shift a future
event into the past.** The engine **may not** do this. "You can't
predict that something will have happened in the past." Each
*shifting* rule (a rule whose `produces` step transforms an event's
`startTime`) must check its proposed output: if the shift would
land at `time ≤ nowMinutes`, the rule must NOT apply the shift.
The only currently-known shifting rule is the upcoming
**putdown-anchor** rule in `bottles.ts` (PR 3c).

## Context

ADR-0001 stated "Now-cross promotion" as a behavior but was
layer-agnostic about *where* in the pipeline it runs.
`docs/_archive/v3/F66_PLAN.md` PR 4 Task 4.2 placed it in `renderProjection`
(render-side, after engine). That's wrong: downstream engine rules
must see past events as `recorded` so they only inform remaining
projections, not re-project them. Engine-side is the right layer.

ADR-0004 then introduced a separate "no past projections" invariant
intended to address Jake's §F66 #4 dogfood scenario: a recorded nap
edit caused `putdown-anchor` to retroactively pull a future
projected bottle into the past, producing a phantom projection. The
ADR's framing — "engine never emits past-now projections, shifts to
next valid future" — was universal in scope but the actual bug was
narrow.

ADR-0005 then chose F4 (per-rule resolvers + seam dispatch) as the
implementation shape for ADR-0004. PR 3b attempted to land it; the
seam activation broke 144 existing tests because the engine
routinely emits past-now projections (the cascade produces the day's
full forecast regardless of clock position; tests assert on that
output). The implementation was reverted before commit.

The course-correction Jake articulated on 2026-05-26: the engine
distinguishes the cause of a past-time placement. A cascade-base
emit at a past time is fine — it auto-promotes (Concern A). A
rule-recalculation shift from future to past is forbidden
(Concern B). These are different mechanisms because the engine can
detect them at different layers: Concern A is universally true of
the engine's output and handled with one post-process pass;
Concern B is local to *shifting* rules and handled inline by each.

## Decision

### Concern A — Engine-side Now-cross auto-promote

A new post-process step in the evaluator (after the fixed-point
convergence loop, before `sort` and return) applies:

```
for each event in events:
  if event.lifecycle.state === "projected" AND event.startTime ≤ ctx.nowMinutes:
    event.lifecycle = { state: "recorded", annotatedAt: event.startTime }
```

No rule registration, no dispatch by type, no resolver functions.
A single one-pass transform.

This **moves** the auto-promote from `renderProjection.ts` (where
`F66_PLAN.md` PR 4 Task 4.2 had placed it) to the engine itself.
Render-side becomes a no-op for promotion (engine output already
has the right lifecycle).

Existing tests update mechanically: assertions on past-now event
`lifecycle.state` change from `"projected"` to `"recorded"`. The
conceptual shape is unchanged; only the lifecycle field rename.

### Concern B — Per-rule "no retroactive shift" check

Each rule whose `produces` step *shifts* an event's `startTime`
(i.e., transforms it relative to some other event or cascade
decision, rather than emitting at a freshly-computed natural time)
must include a structural check:

```
proposedShiftedTime = computeShift(...)
if proposedShiftedTime ≤ ctx.nowMinutes:
  // Skip the shift; fall through to cascade-natural placement.
  // Do NOT emit the event at a past time as a result of recalculation.
```

The fallback ("what to do when the shift would land in the past")
is rule-specific. For putdown-anchor: keep the cascade-natural
emit time (which is in the future since cascade emits forward from
the recorded cursor).

No central seam enforces this. No `resolveNoPast` method on the
`Rule` type. The discipline lives in each shifting rule's local
implementation, alongside its other domain logic, where it can be
unit-tested directly.

**Currently only one shifting rule is known: the putdown-anchor
rule in `bottles.ts` (PR 3c).** If a future rule introduces another
retroactive-shift mechanism, it must add the same check; no central
enforcement will catch the omission.

## Consequences

**Concern A's universal property is now a property of engine output**
rather than a property the engine must enforce against an external
contract. Render-side and downstream cascade rules can rely on it
without further checks.

**Concern B's narrow scope is honest about the bug.** ADR-0004 over-
generalized; ADR-0006 stays tight to the actual problem.

**Existing tests update mechanically for Concern A.** Each test that
constructs `nowMinutes` past some projection finds those projections
become `recorded` after the engine pass. A single conceptual change
across the suite.

**Existing tests likely unchanged for Concern B.** Putdown-anchor
is new (PR 3c); its tests will cover the structural check inline.

**Future shifting rules carry their own responsibility.** Trade-off
accepted: the central-enforcement guarantee ADR-0005 chased isn't
provided. If a new shifting rule is added without the check, the
§F66 #4 class of bug could re-emerge. Mitigated by: (a) shifting
rules are rare, (b) code review on new rules can catch the
omission, (c) a §F66 #4-shaped regression test can be added per
new shifting rule.

## Alternatives considered

- **F4 (ADR-0005's choice)**: per-rule resolvers + seam dispatch.
  Rejected after failed implementation: the seam couldn't
  distinguish Concern A from Concern B and over-fired on every
  routine cascade-base past-time emit.
- **F2 (centralized smart shift in seam)**: seam knows every rule's
  shift constraints. Rejected (still): tight coupling, large blast
  radius.
- **Universal post-process drop**: just drop past-now projections.
  Rejected: contradicts ADR-0001's "Now-cross promotion claims the
  event as recorded" principle; loses information.
- **Render-side auto-promote only** (the original `F66_PLAN.md`
  PR 4 Task 4.2 placement): rejected because downstream cascade
  rules need to see past events as `recorded` to inform remaining
  projections, not re-project them.

## Plan impact

- **`F66_PLAN.md` PR 3b** rescoped: from "F4 seam + resolvers" to
  "engine-side Now-cross auto-promote" (Concern A). Single
  post-convergence pass in `evaluator.ts`. Updates 144 test
  assertions mechanically (`projected` → `recorded` for past-now).
- **`F66_PLAN.md` PR 3c** unchanged in shape: still adds the
  putdown-anchor rule. Now also adds Concern B's structural check
  inline in that rule (one conditional).
- **`F66_PLAN.md` PR 4 Task 4.2** retired: the auto-promote is
  already in the engine after PR 3b. Render-layer transform is
  unnecessary.
- ADR-0004 marked superseded; ADR-0005 marked superseded (never
  implemented).
- `CONTEXT.md` "no-past-projections invariant" entry rewritten to
  reflect the two-concern model.

## References

- ADR-0001 — Now-cross auto-promote (this ADR sharpens its layer placement to engine-side)
- ADR-0004 — original "no past projections" (superseded; over-scoped)
- ADR-0005 — F4 seam (superseded; failed implementation, reverted)
- F66_PLAN.md PR 3b / 3c / 4
- §F66 dogfood scenario #4 (putdown-anchor retroactive pull)
- Course-correction discussion: 2026-05-26 (Jake distinguished Concern A vs Concern B explicitly)
