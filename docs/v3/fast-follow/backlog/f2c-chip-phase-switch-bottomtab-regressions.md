# §F2c — §F2b chip phase-switch + BottomTab regressions

**Source**: Jake, 2026-05-18 (click-test after §F2b PR #178 merged).

**Status**: `pending` — needs verification (click-test on F37 dev
server did NOT show these regressions; may have been a stale-server
artifact from a parallel worktree).

**What**:
1. The chip's wrap-aware phase switching (label/time inline → label
   on top, time+owner below) regressed somewhere between the
   `ChipContent` extraction (commit `c8ecc73`) and the lint refactor
   (commit `fc81519`). Long chip labels truncate-with-ellipsis on row 1
   even though there is room on row 2 — and per Jake's correction:
   sometimes they don't truncate at all, just overflow.
2. The BottomTab nav bar scrolls off the page instead of staying
   pinned. Likely fallout from §F2b's
   `body { overflow-x: hidden; max-width: 100vw }` interacting with
   the BottomTab's `position: fixed` (or sticky) layer.

**Verification step before fixing**: open `main` on a clean dev server
(kill all other Next servers first) and reproduce both symptoms. If
they don't repro, close this entry as "stale-server artifact."

---


