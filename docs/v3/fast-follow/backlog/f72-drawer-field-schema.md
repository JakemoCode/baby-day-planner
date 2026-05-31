# §F72 — config-driven field schema for the event drawer

**Source**: Jake, 2026-05-30 (architectural aside during the pump-volume build).

**Status**: `pending`

**What**: `EventEditDrawerV3` decides field presence/layout with a growing set of
per-type booleans — `showStartTime / showEndTime / showAmount / showVolumes /
showOwner / showLabel` plus the pump start/end pairing. This half is genuinely
declarative and should collapse into a per-type field schema keyed on event type:

```ts
const DRAWER_FIELDS: Record<EventType, FieldSpec[]> = {
  pump:   [{ row: ["startTime", "endTime"] }, { section: "Volumes", row: ["left", "right"] }],
  bottle: ["startTime", "amount", "owner"],
  nap:    ["startTime", "endTime", "owner"],
  …
};
```
A single renderer walks the schema; the show-flags and repeated JSX blocks go away.

**Explicitly out of scope** — the *interaction* half is NOT config-shaped and must
stay as logic: now-button visibility windows (`isFocusNap`/`isNearestBottle`/grace),
the reset/delete policy (`drawerDestructiveAction`), the nap→bedtime threshold
prompt, the short-nap confirm, future-projected locking, and lifecycle routing.
These depend on runtime state (now, sibling events, lifecycle, settings) and
cross-field logic; forcing them into a per-type object just relocates closures
into "config" without simplifying. The win is the field/layout layer only.

**Why fast-follow**: pure refactor, behavior-preserving, all existing drawer tests
stay green. Incremental collapse (step-back rule), not a rewrite. Worth a short
scope doc before implementing since it touches the drawer's whole render body.
