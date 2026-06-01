# §F68 — Post-midnight event vanishes from the still-yesterday timeline

Resolved by **PR #292** (day-rollover): `useReconcileActiveDay` now runs on the
timeline too (via the shared `useDayPageState`) and on app focus/visibility via
a reactive `useCurrentLocalDate`, so the view auto-advances to today instead of
stranding the user on yesterday's day while new events route to today's doc.
