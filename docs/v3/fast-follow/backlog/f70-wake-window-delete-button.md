# §F70 — wake_window shows a Delete button (orphan recorded doc)

**Source**: Jake dogfood, 2026-05-30.

**Status**: `pending`

**What**: A wake_window event sometimes renders a **Delete** button in the
edit drawer. `canDeleteEvent` (drawerDeletePolicy.ts:42) only shows Delete for
`isRecorded(lifecycle) || hasSuppressionDelete(event)`. wake_window isn't a
suppression type, so a Delete button means a **recorded wake_window doc** is
reaching the drawer — which engine rule R4.2 (`wakeWindowOverrides.ts`) is
supposed to drop after merging its owner/label annotation (there's an
`assertAfter` invariant at line 41–43).

**Likely cause**: the owner-edit fallback in `useDrawer.onSave` — when
`setOwnerOverride` is NOT wired, an owner-only edit on a projected event falls
through to `saveEvent({...event, id: recordedIdFor(eventKey)})`, minting a
recorded wake_window doc. The dashboard wires `setOwnerOverride` (edits route to
`Day.ownerOverrides`), but any path without it produces exactly the orphan R4.2
is meant to drop.

**Fix shape**: wake_window edits must always route to ownerOverride, never a
recorded doc (guard in `useDrawer` and/or block the recorded-doc fallback for
wake_window). Write-path fix — needs a **Contaminated Data** section: identify
stale recorded wake_window docs already in Firestore and migrate/wipe/waive.

**Repro TODO**: confirm whether the Delete appears on the dashboard (where
setOwnerOverride is wired) or only on another surface; that narrows the source.

**Related**: [[§F71]] — relabel the destructive action to "Reset" for
engine-derived naps/bottles (revert to projection vs remove doc). Both live in
`drawerDeletePolicy` and should likely be scoped together.
