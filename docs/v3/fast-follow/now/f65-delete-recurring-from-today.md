# §F65 — Add "Delete from today" affordance for daily_recurring events

**Source**: Jake, 2026-05-23 (added during §F56 work).

**Status**: `pending` — split from §F56 (title-with-label) which ships as part of the §F55/56/57 render-polish bundle.

**What**: When a user taps a `daily_recurring` event in today's timeline (e.g. "Tummy time"), they should be able to remove it from today without modifying the recurring template in Settings. Engine plumbing exists already (R11.6: `Day.suppressedRecurringIds` skips that recurring entry for the day).

**Scope**:
1. Add `suppressRecurringForDay(db, childId, dayId, recurringId)` to `src/v3/repositories/days.ts` using Firestore `arrayUnion`. Idempotent.
2. Extend `useDrawer` with optional `suppressRecurring` callback. When `onDelete` is called on a `daily_recurring` event AND `suppressRecurring` is provided:
   - If the event is in actuals (recorded), `deleteOptimistic(eventId)` first.
   - Then `suppressRecurring(recurringId, dayId)` always. Atomic semantics: gone from today regardless of recorded/projected state.
3. `EventEditDrawerV3`: show Delete button for `daily_recurring` regardless of `isRecorded`. Confirmation copy: "Skip [event name] today? It'll come back tomorrow."

**Why fast-follow**: real UX gap surfaced during §F56 work — user can edit a recurring event's time but can't say "not today." Common calendar-app pattern.

**Estimated effort**: ~2 hr (repo fn + hook plumbing + drawer button + tests for both layers).

**Bundle**: ship as PR B after §F55/56/57 bundle merges. Repo function follows the `editWakeTime` / `updateDayOwnerOverride` pattern.
