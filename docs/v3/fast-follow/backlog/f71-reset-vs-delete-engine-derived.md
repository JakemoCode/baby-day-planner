# §F71 — "Reset" instead of "Delete" for engine-derived naps/bottles

**Source**: Jake, 2026-05-30 (recalled prior discussion).

**Status**: `pending`

**What**: Engine-derived (auto-promoted via Now-cross) naps and bottles don't
get *deleted* when the user clears them — they return to their **projected**
state and the cascade re-projects them. The drawer's destructive button should
read **"Reset"** for these, not "Delete", to match what actually happens.

**Current behavior**: `drawerDeletePolicy.ts` *hides* the button entirely for
auto-promoted events — `isAutoPromotedSleep` (nap/bedtime with engine-emitted id)
and `isAutoPromotedBottleEvent` (recorded bottle where `annotatedAt === startTime`)
both make `canDeleteEvent` return false. So today there's no affordance at all.

**Fix shape**: for those engine-derived nap/bottle cases, render a **Reset**
button instead of nothing. Tapping it removes the recorded doc / clears the
anchor so the event reverts to its cascade projection. "Delete" stays for
genuinely user-created/recorded events that have a real doc to remove.

**Open questions**:
- Label/semantics: does "Reset" also apply to a *manually recorded* nap/bottle
  (revert to projection), or only auto-promoted ones?
- Copy in the confirm dialog ("Reset to projected time?").

**Related**: [[§F70]] (wake_window showing a stray Delete) is a different bug —
an orphan recorded doc reaching the drawer — but both live in
`drawerDeletePolicy` and should probably be scoped together.
