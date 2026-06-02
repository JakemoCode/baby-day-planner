# Now-cross auto-promote replaces dashboard action buttons

**Status:** accepted (2026-05-25, §F66 grill)

The engine treats wall-clock crossing of a projected event's relevant
time as the lifecycle promotion signal: instants auto-record at
projected time + default amount; intervals auto-record start (and
later end) at projected times. The only surviving dashboard action
button is "End Nap Now," visible only during an in-progress nap.
Reconciliation with reality happens via the drawer: edit if it ran
differently, delete if it didn't happen.

## Context

By 2026-05-25 we'd accumulated ~14 dogfood bugs (§F66) clustered
around two leaks of the same primitive: the `projected → recorded`
state machine. The state was inferred from a mix of doc shape,
edit-path heuristics, and button presses spread across multiple
writers (NapActionButton, Start Bottle Now, drawer time-edit, drawer
owner-edit, FAB create). Examples: default-amount on-time bottles
silently stayed `projected` and got re-grabbed by "Start Bottle Now"
(#6a); "Start Nap" stamped a new doc on top of an already-recorded
nap (#2b); §F62 idempotency hole in `canCascade`.

## Decision

Single rule: `time-now-crossed AND not user-deleted ⇒ recorded`.
Remove the in-the-moment action buttons (Start Nap Now, Start Bedtime
Now, Start Bottle Now, End Sleep). Keep only "End Nap Now" as an
in-progress carve-out so the user can close a nap early. All other
recording happens implicitly via Now-cross or explicitly via the
drawer (edit/delete).

## Consequences

**Accepted "lie" risk.** An auto-promoted event may not have actually
happened (baby slept through dream feed, parent skipped a bottle).
The user must delete to reconcile. Acceptable while Jake is the
only user; flagged for re-evaluation before wider release.

**Large code deletion.** The button surface area and its writers go
away, taking §F59's id-convention drift, §F62's idempotency hole, and
issue #2b's duplicate-write path with them.

**Cascade simpler.** All past events are `recorded`; the cascade
never anchors off ghost projections.

## Alternatives considered

- *Tap-to-confirm chip* — explicit per-event affirmation. Rejected as
  nag-y and didn't fix the default-on-time bottle case ergonomically.
- *Buffer-grab on button press* — keep buttons, link to nearby
  projection within ±N min. Rejected: still leaves button surface
  area, still has "what if user never presses?" gap, still needs the
  same auto-promote fallback.
- *Auto-confirm after a grace window* — silent promotion N minutes
  after projection. Rejected: indistinguishable from Now-cross in
  effect, only adds latency.

## References

- CONTEXT.md: "Now-cross promotion," "recorded," "happened-fact"
- docs/_archive/v3/fast-follow/grill/f66-cascade-and-state-model-audit.md
- Subsumes §F48 / §F59 (partially) / §F62 in fast-follow/
