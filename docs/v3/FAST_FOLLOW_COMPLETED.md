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

## §F22 — Drawer save-path: route bottles to the correct calendar day

Shipped in **PR #143** (commit `d15731f`). Drawer save-path now routes
writes to the correct calendar day based on the event's `startTime`,
not the active `dayId` — so a 2 AM bottle attaches to the right day.

## §F24 — Start Nap action creates duplicate nap instead of promoting projection

Shipped in **PR #143** (commit `d15731f`). NapActionButton now
promotes the next-projected nap's `eventKey` instead of inventing a
new `nap_${nextNumber}` slot, eliminating the side-by-side duplicate.
PR #143 follow-up (commit `4231f39`) added UUID `eventKey` for
off-pattern naps so they don't masquerade as cascade slots.

## §F25 — Manual nap recorded inside bedtime block claims `nap_1` eventKey

Shipped in **PR #143** (commit `d15731f`) alongside §F22/§F24 — the
save-path now scans existing naps for the next free `nap_N` slot
before assigning, so an in-bedtime manual nap no longer collides
with the day's actual `nap_1`.

## §F26 — Putdown chip synthesized for naps inside the bedtime block

Structurally closed by current `putdown.ts` lifecycle gate. The rule
only sets `hasPutdown=true` for `{projected, overridden}` lifecycles
— a manually-recorded nap is `started` or `completed`, so the
synthetic chip can no longer be emitted. No standalone fix needed.

## §F32 — Retire `EndOfDayCard`; dashboard always shows stats

Shipped in **PR #173** (merged 2026-05-18 as `dd14632`). Retired
EndOfDayCard's two early-return branches; reshaped dashboard around
always-visible `NextBottlePanel` + `NextSleepPanel` + unified `NowBanner`
(wake-window doubles as in-progress sleep banner). Wake gate replaced
with a slim "Wake up" CTA. `StartDayButton` is dev-only. New
`dashboardStats.ts` helpers (totals, last-X, in-progress-skipping
next selector that also filters synthetic putdown render-blocks via
`eventKey === PUTDOWN_KIND_TAG`). Click-test pass caught + fixed
post-PR-open: synth-putdown leak into `NextEventCard`, missing card
chrome on stat panels, and a typography pass aligning panel hierarchy
with `NextEventCard` (hero accent time + delta + footer with totals).

Spec: `docs/_archive/superpowers/specs/2026-05-17-f32-retire-eod-design.md`.
Plan: `docs/_archive/superpowers/plans/2026-05-17-f32-retire-eod.md`.
