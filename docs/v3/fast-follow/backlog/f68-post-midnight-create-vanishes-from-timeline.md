# §F68 — Post-midnight event vanishes from the still-yesterday timeline

**Source**: code-reviewer on PR #284 (midnight-rule routing), 2026-05-30.

**Status**: `pending`

**What**: With the midnight rule (PR #284) in place, creating an event via the
FAB after midnight — while `/timeline` still shows yesterday's active day
(reconcile/rollover hasn't run yet) — correctly routes the event to today's
day doc. But the timeline is subscribed to *yesterday's* day, so the just-created
event **disappears from view** ("where did my 2 AM bottle go?"). It's not lost —
it's on today's not-yet-shown day.

This matches the pre-#282 `handleLogBottle` behavior (not a regression), but it's
a real "did that save?" moment.

**Fix candidates**:
- A confirmation toast on cross-day create: "Logged to May 30" with a tap-to-view.
- Or trigger the day rollover (reconcile) immediately when a cross-day create
  happens, so the timeline advances to today.

**Why fast-follow**: rare (overnight FAB create in the pre-rollover window), not
data-losing — the event persists correctly. Polish.
