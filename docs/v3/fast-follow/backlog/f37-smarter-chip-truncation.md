# §F37 — Smarter chip-label truncation (avoid ellipsis-makes-it-worse)

**Source**: Jake, 2026-05-18 (click-test of §F2b timeline).

**Status**: `pending`

**What**: when a long chip label JUST barely overflows the chip's
max-width, `text-overflow: ellipsis` triggers and the "..." takes more
horizontal space than the chars it replaced. Net: a label like
"Event Name 123" displays as "Event Name 12..." even though the
truncation-free version would have fit naturally.

Standard CSS behavior; fix requires JS measurement. Approach: after
layout, if label is ellipsed, compute (scrollWidth - clientWidth). If
under some threshold (e.g. 20px), suppress ellipsis and either let
the label overflow visually (clip with no ellipsis) or use a
slightly smaller font to fit.

**Why fast-follow**: cosmetic; CSS-standard behavior. Not blocking.

**Estimated effort**: 0.5 day (per-chip ResizeObserver already in
InstantChip for the wrap detection — extend the same effect to also
measure and toggle a `data-near-fit` attribute).


