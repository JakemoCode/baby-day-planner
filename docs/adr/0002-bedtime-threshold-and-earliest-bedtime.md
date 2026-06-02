# Bedtime model: `bedtimeThreshold` (cap on projected nap end) + `earliestBedtime` (floor on projected bedtime)

**Status:** accepted (2026-05-25, §F66 grill)

Split the single-knob bedtime model into two physiologically-distinct
settings. `bedtimeThreshold` (proposed default 5:30pm) is the **latest
time a projected nap is allowed to end** — cascade naps ending past
this are dropped. `earliestBedtime` (proposed default 6:00pm) is the
**floor for projected bedtime startTime**. Recorded events ignore
both (reality wins).

## Context

Today's single `bedtimeThreshold` (default 7:00pm) drives a
nap→bedtime substitution rule that sets `bedtime.startTime = napStart`
when a projected nap crosses the threshold (§F64). A projected nap at
4:46–5:31pm with threshold 7:00pm produces a 4:46pm bedtime — ~5
hours too early. Patching this with case-specific guards (only fire
if start crosses, or pick max(napStart, threshold)) is the kind of
patch-on-patch the step-back rule warns about.

Issue #4 ("manually adjusting bedtime just a bit produces a 5-min
wake window between the last projected nap and bedtime") is a sibling
symptom — today's engine treats manual bedtime edits as a hard
terminator and inserts cascade naps that violate the wake-window
invariant against it.

## Decision

Two settings:

- `bedtimeThreshold` (e.g. 5:30pm) — name preserved but semantic
  **inverted**. Was: "earliest the engine may flip a nap → bedtime."
  Now: "latest time a projected nap is allowed to end. Any cascade
  nap with `endTime > bedtimeThreshold` is dropped."
- `earliestBedtime` (e.g. 6:00pm) — new. The floor for projected
  bedtime startTime. `bedtime.startTime = max(earliestBedtime,
  lastNapEnd + WW)`.

Combined with ADR-0003's future-drawer rule (manual bedtime edits on
future events are not honored), the cascade-natural identity
`bedtime.startTime = lastNapEnd + WW` (or floor) holds by
construction. Issue #4's case mathematically cannot arise.

Recorded events ignore both knobs.

## Consequences

**§F64 resolved by construction.** A nap projecting to 4:46–5:31pm
fails `endTime > 5:30pm` → dropped. Bedtime = `max(6:00pm,
prior-nap-end + WW)`.

**Settings shape changes.** New field; default for `bedtimeThreshold`
shifts from 7:00pm to ~5:30pm; semantic of `bedtimeThreshold`
changes. Solo-dogfooders, so trivial migration.

**No "soft target" bedtime knob.** Engine projects bedtime
deterministically from cascade math + floor. If users want a target
they tune the floor up.

## Alternatives considered

- *Single knob (`earliestBedtime` only)* — drop `bedtimeThreshold`
  entirely; nap→bedtime trigger becomes "last cascade nap whose end
  is past `earliestBedtime` IS bedtime." Rejected: collapses two
  physiologically-distinct concepts (the line baby's nap shouldn't
  cross vs the floor for putting baby down for bed). Jake explicitly
  could not find a clean way to fold them.
- *Three-knob (`bedtimeThreshold` + `earliestBedtime` + `idealBedtime`)*
  with a soft target between the floors. Rejected: extra knob without
  matching physiological concept; cascade math already produces a
  natural target.
- *Keep single knob, fix §F64 with case-specific guard
  `max(napStart, threshold)`* — patch-on-patch; doesn't help #4.

## References

- CONTEXT.md: "bedtimeThreshold," "earliestBedtime"
- docs/_archive/v3/fast-follow/grill/f66-cascade-and-state-model-audit.md
- Supersedes §F64. Subsumes §F66 issue #4.
- DATA_MODEL.md / ENGINE_SPEC.md require updates to match the new semantic.
