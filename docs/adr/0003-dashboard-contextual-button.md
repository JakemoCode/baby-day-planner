# Dashboard contextual button — multi-mode (End Nap / Log Bottle Time)

**Status:** accepted (2026-05-26, §F66 button-design grill). Extends ADR-0001.

The dashboard's single button slot is **multi-modal and hidden by
default**. It shows "End Nap" while a nap is in progress, "Log
Bottle Time" when within ±15min of a projected bottle's startTime,
and disappears otherwise. End Nap wins on overlap; the button only
switches to Log Bottle once any in-progress nap has auto-promoted to
completed.

## Context

ADR-0001 collapsed the dashboard's action buttons into a single "End
Nap Now" carve-out, with auto-promotion-at-Now-cross handling
everything else. Dogfooding revealed a real friction point: when a
bottle happens at default time + default amount, nothing about the
auto-promoted record reflects the actual sit-down moment. The user
can correct the time via the drawer, but that's three taps for what
is conceptually "I am logging that I'm starting the bottle right
now." ADR-0001 left no in-the-moment affordance for this.

The grill explored several shapes (dedicated FAB, persistent log
button, confirm-projected affordance) and converged on extending the
existing single button to a contextual two-mode design.

## Decision

The dashboard renders **at most one contextual button** at a time,
selected by:

```
in-progress nap?                  → "End Nap"           (sets nap.endTime = Now)
else within ±15min of a projected
  bottle's startTime?             → "Log Bottle Time"   (writes recorded bottle:
                                                          startTime = Now,
                                                          amount = default)
else                              → hidden
```

The Log Bottle action **overwrites** any auto-promoted projection at
that slot — the auto-promote (ADR-0001) records the bottle at the
projected time with the default amount as a render-layer transform;
the button records (or replaces) at the actual sit-down moment.

**Overlap rule:** End Nap always wins while a nap is in progress.
The bottle window is the next-most-urgent action; it activates only
after the nap auto-promotes to completed.

**Putdown-bottle special case** (bottle anchored to putdown.startTime
via the [[putdown bottle-anchor rule]]): during the ±15min window
the nap hasn't started yet, so Log Bottle is the active mode. After
Now > bottle.startTime + 15min, the button switches to End Nap
(which coincides with putdown ending and the actual nap starting).

## Consequences

**Captures actual sit-down time** for bottles that happen at default
amount. Solves §F66 issue #6a's residual ergonomics gap without
reintroducing the "Start Bottle Now" surface area ADR-0001 removed.

**Multi-modal button is harder to discover** than a labeled FAB.
Acceptable while Jake is solo dogfooder; needs re-evaluation if/when
the app reaches wider use.

**Implementation grows PR 4** (Now-cross + remove buttons) to also
include the bottle-window mode logic. The single-button surface is
already touched by that PR; the additional mode is incremental.

## Alternatives considered

- *Dedicated "Log Bottle" FAB* — always-visible button on the
  timeline. Rejected: reintroduces a persistent action surface and
  works against the ADR-0001 collapse.
- *Confirm-projected affordance on each chip* — tap a projected
  bottle chip, drawer offers "Confirm as projected." Rejected
  earlier (in the §F66 grill) as nag-y and not capturing actual
  time.
- *Auto-record at Now when user touches the bottle's chip* —
  rejected: chip taps already open the drawer; conflating the
  affordances is surprising.
- *Window-only "Log Bottle" mode without the End Nap consolidation*
  (i.e., two separate buttons) — rejected: undermines the ADR-0001
  "one button" principle without compensating benefit.

## References

- CONTEXT.md: "dashboard contextual button," "Now-cross promotion"
- ADR-0001 (Now-cross + button removal) — this ADR extends it
- §F66 grill: docs/v3/fast-follow/grill/f66-cascade-and-state-model-audit.md
