# §F48 — "Last nap" line on dashboard shows wrong time after manual edit

**Source**: Jake, 2026-05-22.

**Status**: `pending`

**What**: Manually edited the most recent nap on /timeline. The dashboard's "Last nap" line then read `"45m, 0 min ago (4:02p)"` — but it was ~2:30pm at the time, so 4:02p was ~2.5 hrs in the *future*. Two related symptoms:
1. Display string says "0 min ago" but the time shown is in the future.
2. Either the "ago" is computed off the original nap timestamp (pre-edit) while the parenthetical clock is post-edit, or the nap actually projected forward and the dashboard picked the projected nap as "last."

**Hypotheses (need triage)**:
- The dashboard "Last nap" summary may be reading the projected/predicted nap list rather than actual `nap` events, so an actual nap that ended in the past but had its end-time edited to a future time gets flagged as still in-progress AND the summary sees the *next projected* nap as "last".
- "0 min ago" suggests `Math.max(0, now - endTime)` clamping on a negative delta — when endTime > now, the delta is negative and gets clamped to 0, but the clock string is still rendered from the raw (future) endTime.

**Fix shape**: locate the "Last nap" summary component; verify it filters to events where `endTime <= now` before picking the most recent; show "in progress" / "ends in N min" when endTime is in the future, not "0 min ago".

**Why fast-follow**: not blocking V3 functionality, but visibly wrong to a user dog-fooding the app.

**Estimated effort**: ~1–2 hr (triage + fix + add seam test for the wrong-direction edit case).

---


