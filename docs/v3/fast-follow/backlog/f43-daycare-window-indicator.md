# §F43 — Timeline visual indicator for events during daycare window

**Source**: Jake, 2026-05-19 (Daycare redesign — see PR #189).

**Status**: `pending`

**What**: a subtle visual cue on Timeline event blocks/chips that fall between `daycare.dropoffTime` and `daycare.pickupTime` on a daycare weekday. Communicates "this happens at daycare" without polluting the event's `owner` field.

**Why fast-follow**: PR #189 deleted R21.3 (which used to stamp the daycare owner on these events). The replacement is purely visual — no schema or engine change, just CSS + a derived attribute in the render pipeline.

**Plumbing**:
- Render layer (`renderProjection.ts` or `TimelineV3` block factory) tags events whose `startTime` falls in `[dropoff, pickup)` with `data-during-daycare` when daycare is active for the day.
- `Block.module.css` adds `.block[data-during-daycare] { background: var(--color-owner-daycare-tint); border-left: 3px solid var(--color-owner-daycare); }` or similar.
- Read the daycare window from the projected `daycare_dropoff` / `daycare_pickup` events (already emitted by R21.1), not from settings — this picks up recorded-shifted windows automatically.

**Acceptance**:
- On a weekday with daycare enabled, projected naps/bottles between dropoff and pickup show the visual cue.
- The cue does NOT appear on suppressed daycare days (`Day.suppressedDaycareDay = true`).
- The cue updates if the user records dropoff/pickup at different times than projected.
- Recorded events keep the cue too — daycare doesn't stop being daycare just because the user logged the nap.

**Estimated effort**: ~30-60 min. One CSS class + one renderProjection attribute pass + a single integration test.

---


