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

**Fix**: the self test has to tell the edited event's own recorded
copy (the doc the save writes under the same `eventKey`, which the
PR #321 flash fix exists for) apart from a different recorded bottle
that happens to share the key. An id-prefix test alone cannot: the
grade on PR #323 showed that "match on key only for `proj_` ids" brings
the save flash back for every projected bottle. Compare by the doc id
the save will write (`recordedIdForEvent`) rather than by key. Two
seam tests: a projected `bottle_3` saved beside its own recorded copy
shows no alert; a projected `bottle_3` edited to within ten minutes of
a different recorded `bottle_3` shows the too-close error.

**Why fast-follow**: a validation gap, not a data-corruption path; the
engine model retires stored bottle keys anyway, which removes the
collision at the source.
