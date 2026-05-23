# §F56 — Recurring event drawer should show the event title

**Source**: Jake, 2026-05-23.

**Status**: `pending` (bundle with §F55)

**What**: Tapping a recurring event opens the EventEditDrawerV3 with no title field populated. For good UX, the drawer should show the recurring event's name (e.g. "Tummy time", "Walk", etc.).

**Fix shape**: `EventEditDrawerV3` likely resolves title via `event.label`, but recurring events may use `recurringId` to look up the name from `Settings.dailyRecurring[]`. Hydrate the title from there when present.

**Estimated effort**: ~15 min (bundled with §F55).

---


