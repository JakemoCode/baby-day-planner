# §F6 — Better time / duration input UX

**Source**: cutover dogfooding, 2026-05-09 — native HTML
`<input type="time">` is awkward on desktop: typing minutes
directly doesn't work, you have to use arrow keys or the
browser's time-picker popup.

**Status**: `pending`

**What**: replace native time inputs across the V3 settings
page (and EventEditDrawerV3) with a custom picker:
- Two-finger / two-thumb clock-face picker on touch
- Direct numeric typing on desktop ("0830" → 8:30 AM)
- Inline validation (out-of-range gets clamped or rejected)
- Same UX for absolute times (TimeMin) AND durations
  (where "02:30" means 2h 30m)

**Why fast-follow, not pre-V3**: native input works for the
engine's correctness — just not for ergonomics. Worth doing
once after dogfooding identifies how often time entry happens
in real use.

**Estimated effort**: 1–2 days. Single picker component lands
in `src/v3/components/shared/`, then call sites swap in.

**Acceptance**:
- No `<input type="time">` left in V3 component tree
  (timeline drawer, settings page, anywhere else).
- Picker handles both absolute time and duration semantics
  (consumers pass a mode prop).
- Touch and desktop UX both feel native.
- Direct keyboard typing works on desktop without touching
  the popup.

---


