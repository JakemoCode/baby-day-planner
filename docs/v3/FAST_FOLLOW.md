# V3 Fast-Follow Backlog

> Items deferred to land **soon after** the V3 engine rebuild ships
> (i.e., after Phase 4 — V3 default flip + V2 cleanup). Not blocking
> Phase 1; not bundled with V3 PRs.

> Each item should be a small, self-contained PR that doesn't touch
> the rules engine. The fast-follow window is the time between V3
> stable and Wave 9 (PWA + E2E + design audit).

---

## Status legend

- `pending` — not yet started
- `in-progress` — actively being worked on
- `done` — landed; remove from this list

---

## §F1 — Settings page collapsible accordion

**Source**: OUT_OF_SCOPE §11 (V2 backlog item).

**Status**: `pending`

**What**: convert the Settings page sections (Times, Bottle, Naps,
Owners, Daycare, Members, …) into a collapsible accordion. Only one
section open at a time; remembered selection persists per-device
(localStorage).

**Why fast-follow, not in V3**: pure UI; engine-orthogonal. Doesn't
need any V3 plumbing.

**Estimated effort**: 1 day. Single PR against `main` after V3 stable.

**Acceptance**:
- Each section header collapses/expands on tap.
- Open section persists across page navigations.
- Keyboard accessible (Tab to header, Enter/Space to toggle).
- No regression in the existing form behavior.

---

## §F2 — Palette refresh

**Source**: OUT_OF_SCOPE §12 (V2 backlog item, 🔥 flagged twice).

**Status**: `pending`

**What**: rework `src/styles/tokens.css` to address two longstanding
issues:
1. Too much white (cards/surfaces blend into background).
2. Owner tints (sage, terracotta, dusty blue, coral) too pale to
   reliably distinguish on small chips and stripe overlays.

**Why fast-follow, not pre-V3**: ARCHITECTURE_V3 §6.4 differential
testing checks engine *output* (event arrays), not rendered pixels.
Palette can shift independently. Doing it pre-V3 would burn the
"awaiting plan ratification" window we no longer have.

**Estimated effort**: 2–3 days. Includes a `/design-audit` pass at
the end to verify contrast and visual hierarchy on the existing V3
timeline.

**Acceptance**:
- Owner stripes readable as colored bands at chip-thumbnail size.
- Surface vs. background contrast ratio ≥ 1.4 (currently ~1.05).
- Existing tokens stay token-named (no inline colors anywhere).
- `/design-audit` run on `/timeline`, `/dashboard`, `/settings`
  reports zero new critical or major issues.

---

## How items land here

Two paths:
1. **From OUT_OF_SCOPE**: an item flagged `fast-follow` during V3
   review.
2. **During V3 build**: a polish item discovered while building V3
   that's clearly not engine-shaped — flag here rather than
   side-tracking the engine PR.

When an item is done, delete it (or move to a `## Completed` section
at the bottom). Keep this doc short and actionable.

---

## Source References

- `OUT_OF_SCOPE.md` — items currently `fast-follow`-flagged.
- `REQUIREMENTS.md` — V3 engine requirements (read first if a
  fast-follow item turns out to need engine knowledge).
- `ARCHITECTURE_V3.md` — V3 architecture; relevant for understanding
  what NOT to break with a fast-follow PR.
