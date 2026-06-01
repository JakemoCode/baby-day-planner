# §F67 — "Next bottle" panel shows no upcoming bottle most of the day

Fixed: `page.tsx` now feeds `NextBottlePanel` the `nextBottle(projected, now)`
selector (next bottle at/after now, any distance) instead of the ±15-min
`nearestBottleInWindow` (which stays wired to `ContextualActionButton`).
Regression test in `page.test.tsx`. Confirmed 2026-06-01.
