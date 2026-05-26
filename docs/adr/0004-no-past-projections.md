# No-past-projections invariant

**Status:** **superseded by [ADR-0006](./0006-now-cross-and-no-retroactive-shift.md)** (2026-05-26 course-correction). Kept for history.

> **Why superseded:** this ADR conflated two separable concerns — (A) what happens when the wall clock moves forward past a projection's time, and (B) what happens when a rule's recalculation would move a future event into the past. The original "engine moves projection to next valid future" framing was correct for (B) but wrong for (A) — under [ADR-0001](./0001-now-cross-auto-promote.md)'s Now-cross auto-promote, a past-time projection is recorded reality (with a "lie risk" the user reconciles by deleting), not a forecast that needs shifting. ADR-0006 splits the concerns and assigns each its correct layer. PR 3b's F4-seam implementation (per ADR-0005) was the failed consequence of this conflation; reverting the implementation surfaced the design flaw.

**Original (pre-supersede) text follows.**

**Status:** accepted (2026-05-26, §F66 button-design grill).

A cascade-computed projection's time must always be strictly greater
than Now. If the engine's natural placement (including the [[putdown
bottle-anchor rule]], cascade interval, snap-out-of-nap, etc.) would
produce a projection at a time already past, the engine instead moves
the projection to the **nearest future time that obeys all other
projection rules** (not inside an active nap, not before another
recorded event, respects min-interval). Applies to every projected
event type — bottles, naps, bedtime, putdown render.

## Context

The dogfooding grill surfaced an edge case: nap was projected
12:00–12:45 with a post-nap bottle at 12:45; baby took 20 extra
minutes to settle, so user logged nap start at 12:20pm. Cascade
re-ran with the new nap (12:20–1:05); the post-nap bottle, having
been at 12:45 (mid-day, no putdown-anchor concern previously), now
falls inside the first half of the new nap interval. The
[[putdown bottle-anchor rule]] therefore wants to snap it to
nap.startTime − putdownLeadMinutes = 12:05. But Now = 12:30. The
12:05 placement is 25 minutes in the past.

ADR-0001's Now-cross auto-promote rule would then claim the bottle
"happened" at 12:05 — a fact the engine just retroactively
manufactured. This violates the "engine predicts, not prescribes"
axiom and erodes confidence in projections (the entire reason §F66
exists).

The grill considered four shapes (snap-to-Now, drop entirely, snap
to next valid future, error-and-fallback). Jake rejected each on
"reality wins" grounds except the next-valid-future placement,
which preserves the bottle's existence in the day's forecast without
inventing past events.

## Decision

For every cascade-computed projection, the engine enforces:

```
projection.startTime > Now
```

If the natural calculation produces `time ≤ Now`, the engine
replaces it with the nearest future time satisfying all other
projection rules. In the worked example: bottle moves to
nap.endTime (1:05pm) — the first valid future slot after the active
nap ends.

**Precedence over putdown-anchor**: if the putdown-anchor snap would
land in the past, the snap is skipped and the past-projections rule
takes over.

**Recorded events ignore the invariant** — they're reality, not
projections.

## Consequences

**Cascade re-runs stay forward-only.** A recompute can never
"create" past events that didn't previously exist as projections.
The auto-promote-at-Now-cross transform stays an honest reflection
of forecasts the engine already made.

**Engine implementation gets one chokepoint.** The cascade's
emit-projection step gains a final "is this in the future?" guard
that re-locates the projection if needed. Cleaner than per-rule
"don't go backward" guards.

**Bottle slot survives nap edits.** In the worked example, the
day still forecasts the post-nap bottle (at 1:05) rather than
dropping it — matches "we're not going to skip a bottle because his
nap started late."

**No new settings.** Invariant is derivable from existing concepts.

## Alternatives considered

- *Snap to Now* — rejected: claims a feeding/event is happening RIGHT
  NOW when reality is that baby is still napping. Violates "reality
  wins."
- *Drop the projection* — rejected: the bottle still needs to happen;
  dropping it shortens the day's chain without basis.
- *Snap to Now + min-interval fudge* — rejected: invents an
  arbitrary constant for what's really "the next valid slot," which
  is already well-defined by the existing rules.
- *Error/log and fall back* — rejected: an error is useless to a
  tired parent who just wants the timeline to be coherent.

## References

- CONTEXT.md: "no-past-projections invariant," "putdown bottle-anchor rule"
- ADR-0001 (Now-cross auto-promote) — this ADR keeps it honest
- §F66 grill: docs/v3/fast-follow/grill/f66-cascade-and-state-model-audit.md
