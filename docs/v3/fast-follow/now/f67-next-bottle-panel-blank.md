# §F67 — "Next bottle" panel shows no upcoming bottle most of the day

**Source**: Jake, 2026-05-29 dog-fooding. ("Next Bottle does not show the next bottle — grouped?")

**Status**: `fixed` — `page.tsx` now feeds `NextBottlePanel` the existing `nextBottle(projected, now)` selector (next bottle at/after now, any distance) instead of `nearestBottleInWindow` (the ±15-min log-confirm window, which stays wired to `ContextualActionButton`). Regression test: `page.test.tsx` "§F67: Next bottle panel shows the next bottle even when it's >15min out".

**What**: the dashboard's `NextBottlePanel` heading says "Next bottle" but the time row is blank except in a narrow window around the projected slot. So for most of the day the panel only shows the "Last:" and "Today:" lines — never the actual next upcoming bottle.

**Root cause** (not grouping): `src/app/(signed-in-with-child)/page.tsx` passes the panel `nextBottle={nb}`, where
`nb = nearestBottleInWindow(projected, nowMinutes, LOG_BOTTLE_WINDOW_MIN)` (`LOG_BOTTLE_WINDOW_MIN = 15`). `nearestBottleInWindow` returns `undefined` unless a projected bottle is within **±15 min** of now — it's the selector for the contextual "Log Bottle Time" button, not for "what's the next bottle." When the next bottle is >15 min out (the common case), `nb` is `undefined` and the panel's time row doesn't render.

Contrast `NextSleepPanel`, which is correctly fed `nn = nextNap(projected, nowMinutes)` (no window) — so sleep shows its next event but bottles don't.

**Fix shape**: give `NextBottlePanel` its own "next bottle at/after now" selector — analogous to `nextNap` in `src/v3/selectors.ts` (filter `type === "bottle"`, engine events, `startTime >= now`, earliest). Keep `nb` (the ±15-min window selector) for `ContextualActionButton`'s log-window logic — that usage is correct. Don't conflate the two props.

**Why fast-follow**: visibly wrong on the main dashboard while dog-fooding; the panel's headline promise ("Next bottle") is unmet most of the day. Engine-orthogonal — selector + one prop wire.

**Estimated effort**: ~½–1 hr (add selector + test, swap the prop, seam test that the panel shows the next bottle when it's >15 min out).
