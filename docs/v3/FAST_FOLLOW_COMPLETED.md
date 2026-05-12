# V3 Fast-Follow — Completed

Compressed history of items that originated in `FAST_FOLLOW.md` and
have since shipped. Kept for audit trail and future reference.

When an item completes, compress its entry to: heading + 1-sentence
description + the PR that shipped it. Drop the "Why fast-follow" and
"Estimated effort" rationale.

---

## §F7 — Delete the V2 ← V3 back-compat shim

Shipped in **PR-C1** (commit `bacebe4`, merged 2026-05-11). Removed
`v2Backcompat.ts`, all V2 hooks (`useDays`, `useEvents`, etc.), V2
components under `src/components/`, the entire `src/domain/`
directory, and `src/lib/firestore/converters.ts`. V3 is the single
runtime.

## §F9 — Audit Timeline V2 test coverage

Performed during V3 cutover preparation; output captured in
`docs/_archive/v3/F9_TEST_AUDIT.md`. The audit identified the
V2-test → V3-engine port obligations that gated PR-C1; all
identified gaps were either ported or explicitly waived before the
V2 wipe.

## §F20 — Changing nap time removes putdown

Shipped in two coordinated PRs:
- **PR #117** — `formToEvent` now treats drawer time-edits on scheduling
  types (`nap`, `bedtime`, `daily_recurring`) as `overridden` rather than
  promoting to `completed`. Preserves putdown gate eligibility.
- **PR #122** — Naps rule cascade made unconditional:
  `wake_window(N).endTime === nap(N).startTime` regardless of nap
  lifecycle. Removed the lifecycle-branched anchor that left a gap when
  PR #117 produced an `overridden` nap.

Putdown is render-only and now re-derives correctly from edited naps.
