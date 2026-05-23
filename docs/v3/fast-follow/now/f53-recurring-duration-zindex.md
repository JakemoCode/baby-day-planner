# §F53 — Recurring events with duration render behind other events

**Source**: Jake, 2026-05-23.

**Status**: `pending`

**What**: Recurring duration blocks (e.g. a daily 3pm walk) paint underneath naps / wake_windows / extras that overlap them. Likely cause: `TimelineV3.zOrder()` doesn't recognize recurring events as a distinct class and they fall through to the default `z=1` (wake_window-tier).

**Fix shape**: extend `zOrder()` in `src/v3/components/Timeline/TimelineV3.tsx` to give recurring blocks a tier above wake_windows but below naps (probably tier 1.5 → bump everything else, or add explicit recurring case).

**Estimated effort**: ~15 min once we confirm the canonical recurring-event discriminator (`isRecurring`? `event.recurringId`? — read the schema).

---


