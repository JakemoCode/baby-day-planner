# §F72 — config-driven field schema for the event drawer

Shipped in **PR #290** (commit `d9fa0a4`). The drawer's per-type field
show-flags + pump-pairing ternary collapsed into a declarative
`DRAWER_FIELD_SCHEMA` walked by one renderer; interaction logic (now-buttons,
reset/delete policy, threshold prompt) stayed as code. Rode along: owner
picker on `daily_recurring` (per-day via `Day.ownerOverrides`, not the template).
