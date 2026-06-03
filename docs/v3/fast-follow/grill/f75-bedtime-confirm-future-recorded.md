# §F75 — change-to-bedtime confirm can mint a future-dated `recorded` event

**Source**: realization-seam grill (candidate 1, architecture review), 2026-06-03.

**Status**: `pending` — investigate intended semantics before any code.

**What**: `handleConfirmChangeToBedtime` (`EventEditDrawerV3.tsx`) always builds the
bedtime with `lifecycle: { state: "recorded", annotatedAt: now }` and
`startTime = the source nap's startTime`. On one (unusual) path that combination is
inconsistent: a **recorded** nap edited to a *future* time `>= bedtimeThreshold`,
then confirmed, mints a `recorded` event whose `startTime` is in the future —
contradicting the [[happened-fact]] rule (`recorded` ⇒ a time already past).

Future-**projected** naps are already structurally excluded (the `futureProjected`
sanitization at `EventEditDrawerV3.tsx:376` reverts their edited `startTime`, so they
can't trip `crossedThreshold`). So the only path in is "edit an already-recorded nap
to a future ≥-threshold time + confirm" — deliberate and rare.

**Investigate**: is `recorded`-by-explicit-confirm the intended semantics ("the button
does what it says on the tin"), or should the confirm route through `reduceLifecycle`
so a *future* bedtime becomes planning intent (`projected`) per the future-event drawer
rule? Decide the semantics first; the fix (if any) is small.

**Why fast-follow (not now)**: edge path, not data-corrupting, defensible by the
explicit confirm. Surfaced while keeping candidate 1 (the realization-seam refactor)
behavior-preserving — we deliberately did **not** change this lifecycle outcome there;
bedtime-confirm just moved from a raw literal to `recordedLifecycle(now)` (same value).

**Estimated effort**: ~30 min grill → small if a change is wanted.
