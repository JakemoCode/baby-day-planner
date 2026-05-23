# §F8 — Dashboard UX polish pass

**Source**: Jake, 2026-05-10 click-test feedback.

**Status**: `pending`

**What** (collected items — split into sub-PRs as appropriate):

- **Day total ounces**: surface "X.X oz today" on the dashboard
- **Last bottle consolidation**: replace `"logged X oz Bottle N / last: HH:MMa X oz"` with a single line `"last bottle: HH:MMa X oz"` and tap-to-edit
- **Start Bottle button needs owner**: the current "Start" action commits without prompting for owner — add inline owner pick or default to last-used
- **Edit nap start time from dashboard**: naps usually get "Started" 5+ min after actual start (busy putting baby down). Need an easy retro-edit affordance on the dashboard, not just in the drawer
- **"In wake window" banner — show "asleep?"**: clarify state when baby's already napping but the WW projection is still active
- **Button hierarchy**: Primary = start next event, Secondary = edit last event, Tertiary = skip event

**Why fast-follow**: UX polish on a working dashboard; engine-orthogonal.

**Estimated effort**: split into 3-5 small PRs. ~1-2 days total.

---


