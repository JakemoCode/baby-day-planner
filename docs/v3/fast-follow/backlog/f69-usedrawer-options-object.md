# §F69 — useDrawer: convert positional params to an options object

**Source**: code-reviewer + code-simplifier on PR #284, 2026-05-30.

**Status**: `pending`

**What**: `useDrawer(actuals, saveEvent, deleteOptimistic, setOwnerOverride?, suppressions=[], saveNewEvent?)`
is now 6 positional params with two optionals — past the ergonomic limit. PR #284
added the 6th (`saveNewEvent`) and both reviewers flagged the signature as
approaching "convert to an options bag" territory, but deferred it as scope creep.

**Fix shape**: convert to a single options object `useDrawer({ actuals, saveEvent,
deleteOptimistic, setOwnerOverride?, suppressions?, saveNewEvent? })`. Touches both
call sites (`useDayPageState.ts`, `tomorrow/page.tsx`) and the test harness in
`useDrawer.test.ts`. Mechanical, behavior-preserving.

**Why fast-follow**: pure ergonomics; no behavior change. Do it before the 7th param.
