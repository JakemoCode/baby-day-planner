# §F8 — Dashboard UX polish pass

**Source**: Jake, 2026-05-10 click-test feedback. **Re-triaged 2026-06-01.**

**Status**: `pending` — most items shipped or obsolete; two remain.

**Remaining**:

- **Last-bottle line**: reformat to a single `"last bottle: HH:MMa X oz"` line
  (tap-to-edit already works).
- **Button hierarchy audit**: confirm primary = start next event, secondary =
  edit last, tertiary = skip — and fix any drift.

**Done / obsolete (2026-06-01 triage)**:

- ~~Day-total ounces on the dashboard~~ — shipped.
- ~~Start-Bottle action should capture an owner~~ — obsolete; the Start/Log
  Bottle button was removed in PR #282, no such action remains.
- ~~Retro-edit nap start time from the dashboard~~ — dropped.
- ~~"In wake window" banner should clarify "asleep?"~~ — dropped.

**Why fast-follow**: UX polish on a working dashboard; engine-orthogonal.
