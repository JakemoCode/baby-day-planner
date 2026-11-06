# §F77 — Drawer self-match by eventKey can skip a recorded bottle

**Source**: `/code-review low` on PR #323, 2026-11-06. Pre-existing from
PR #321 (validation flash fix).

**Status**: `pending`

**What**: `EventEditDrawerV3.tsx` `isSelf` treats any event sharing a
`proj_` source's `eventKey` as the event being edited, so the overlap and
ten-minute `tooClose` checks skip it. Recorded bottle keys are not unique
(the R5.4 comment beside it says so), so editing a projected bottle keyed
`bottle_3` while a recorded bottle also stored as `bottle_3` exists lets a
too-close save through.

**Fix**: match on `eventKey` only when the candidate is itself
engine-emitted (`proj_` id) or the type is not bottle. One seam test:
projected `bottle_3` edited to within ten minutes of a recorded
`bottle_3`, expect the too-close error.

**Why fast-follow**: a validation gap, not a data-corruption path; the
engine model retires stored bottle keys anyway, which removes the
collision at the source.
