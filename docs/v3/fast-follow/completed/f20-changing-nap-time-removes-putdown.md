# §F20 — Changing nap time removes putdown


Shipped in two coordinated PRs:
- **PR #117** — `formToEvent` now treats drawer time-edits on scheduling
  types (`nap`, `bedtime`, `daily_recurring`) as `overridden` rather than
  promoting to `completed`. Preserves putdown gate eligibility.
- **PR #122** — Naps rule cascade made unconditional:
  `wake_window(N).endTime === nap(N).startTime` regardless of nap
  lifecycle. Removed the lifecycle-branched anchor that left a gap when
  PR #117 produced an `overridden` nap.

Putdown is render-only and now re-derives correctly from edited naps.
