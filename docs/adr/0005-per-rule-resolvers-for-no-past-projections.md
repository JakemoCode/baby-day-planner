# Per-rule resolvers + seam dispatch for no-past-projections

**Status:** accepted (2026-05-26, §F66 architecture-deepening grill). Implements ADR-0004.

ADR-0004 mandated the no-past-projections invariant but didn't say *where* the placement logic lives. We choose **per-rule resolvers + a thin seam-dispatcher**: each producing rule exports a `resolveNoPast(event, ctx, allEvents): Event | null` function that knows how to shift an event of its own type to a valid future slot; the evaluator's post-process seam iterates projected events, looks up the owning rule by event type, and dispatches. Rejects: (a) dumb shift + fixed-point reconciliation (F1), (b) centralized smart shift inside the seam (F2), (c) every rule enforcing inline at emit time (F3 / Path 3).

## Context

ADR-0004 codified: a cascade-computed projection's time must always be `> Now`; if natural placement would land in the past, the engine "moves the projection to the nearest future time that obeys all other projection rules." Architecturally that prose left open: who computes "next valid future"?

Four shapes were considered during the §F66 architecture-deepening grill (2026-05-26):

| Shape | Placement logic location | Coupling | Determinism |
|---|---|---|---|
| F1 — dumb shift to `now + ε`, fixed-point reconciles | Distributed across existing rule validators | None | Relies on fixed-point convergence |
| F2 — smart shift centralized in seam | Seam | Seam couples to every rule | Deterministic, one-pass |
| F3 — rules enforce inline at emit step | Each rule | None | Deterministic per-rule, but no central guarantee |
| **F4 — per-rule resolvers + seam dispatch** | **Each rule's resolver (callable from seam)** | **Loose (dispatch by event type)** | **Deterministic, one-pass** |

F1's "elegant dumbness" turned out to assume rules dedupe shifted projections cleanly — unverified and likely false in places (e.g., bottles.ts cascade trims by chain window; a shifted bottle inside a nap may or may not be re-emitted cleanly). F2 forces the seam to know every rule's blocking semantics — exactly the coupling §F66 set out to escape. F3 distributes the invariant with no central enforcement, undermining the "cross-cutting" framing entirely.

## Decision

The `Rule` type gains an optional method:

```
resolveNoPast?(event: Event, ctx: Context, allEvents: Event[]): Event | null
```

Semantics:
- Called by the evaluator's post-process seam for any projected event with `startTime ≤ nowMinutes`.
- Returns the shifted event (with a future `startTime` satisfying the rule's own placement constraints) OR `null` to drop the slot entirely.
- Rules that never emit projected events vulnerable to the past-now case (e.g. daycare's hardcoded slots, daily-recurring) may omit the method.

The evaluator's seam:
- Sits parallel to `checkRealityWins` — same post-rule-emit position.
- Iterates projected events; for each past-now event, looks up the owning rule by event type, calls `resolveNoPast`.
- If a producing rule lacks a resolver AND the seam encounters a past-now event of that type, throws an `EvaluationError` (CI catches the missing registration; no silent fallback).

## Consequences

**Placement logic stays with its constraints.** `bottles.ts` already knows the cascade interval + snap-out-of-nap; its resolver uses that knowledge. `naps.ts` already knows the cascade cursor; same.

**The seam is a thin dispatcher.** Routing by event type, nothing else. No knowledge of rule-specific constraints. Adding a new producing rule means writing its resolver — not editing the seam.

**Deterministic, single-pass enforcement.** No reliance on fixed-point convergence to clean up after a "dumb shift." Fewer ways for the engine to behave surprisingly under edit-heavy days.

**Explicit cost.** Producing rules need ~5–15 lines of resolver each (mostly exposing existing placement logic via the new interface). Rule interface grows by one optional method.

**No fallback by design.** A producing rule that forgets to register a resolver and later emits a past-now event triggers `EvaluationError` in CI. Preferred over silent dumb-shift fallback (which would re-introduce F1's fragility).

## Alternatives considered

- **F1 (dumb shift + fixed-point)** — rejected. Assumed rules dedupe and re-converge cleanly under shifted input; unverified; bottles.ts trim semantics suggest it would produce duplicates or stale projections.
- **F2 (smart shift in seam)** — rejected. Tight seam-to-rule coupling. Every new producing rule means editing the seam. Exactly the scatter §F66 set out to escape, inverted.
- **F3 (inline per-rule enforcement)** — rejected. Distributes the invariant with no central guarantee; every rule has to remember; the "cross-cutting concern" framing dissolves.

## References

- ADR-0004 — no-past-projections invariant (this ADR is its implementation shape).
- CONTEXT.md "no-past-projections invariant" (semantic) → implementation shape lives here.
- §F66 architecture-deepening grill (2026-05-26) candidates C1 and C2.
