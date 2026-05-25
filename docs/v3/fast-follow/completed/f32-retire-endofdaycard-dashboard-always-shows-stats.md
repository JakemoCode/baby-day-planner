# §F32 — Retire `EndOfDayCard`; dashboard always shows stats


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
