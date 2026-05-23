# §F31 — Responsive timeline (drop magic-number widths)

**Source**: Jake, 2026-05-16.

**Status**: `pending`

**What**: TimelineV3 uses fixed-pixel constants (`AXIS_W = 28`, `GUTTER_W = 124`, `BLOCK_LEFT_INSET = AXIS_W + 8`, `BLOCK_RIGHT_INSET = GUTTER_W + 24`, etc.) that don't adapt to viewport width. Two related concerns:

1. **Responsive layout** — switch to percentages or `calc()` so the block/chip column proportions scale with available width. Current fixed-px layout looks fine on a phone-width viewport and bloated on desktop (or vice versa).
2. **Narrow-screen break** — below a screen-width threshold (TBD; ~360px?), instant chips should break their label to two lines (`Bottle 3` / `1p · Jake`) instead of cramming horizontally. Avoids overflow / truncation on small phones.

**Why fast-follow**: cosmetic UX polish; engine-orthogonal. Sits in `TimelineV3.module.css` + chip components. Worth doing alongside or after §F2 palette refresh and §F29 contrast audit so the visual sweep lands together.

---


