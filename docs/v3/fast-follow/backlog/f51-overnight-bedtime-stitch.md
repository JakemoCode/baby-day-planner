# §F51 — Extend yesterday's overnight bedtime block to first wake event

**Source**: Jake, 2026-05-22.

**Status**: `pending`

**What**: On `/timeline`, the overnight bedtime block from yesterday currently ends at midnight (or wherever the previous day's projection capped it). It should visually extend down to the first wake event of today — so the user sees a continuous "sleep" lane from yesterday's putdown to today's wake-up.

**Why fast-follow**: visual continuity; doesn't change any underlying data.

**Estimated effort**: ~1–2 hr (projection layer or render-time stitching of cross-day bedtime block).

---


