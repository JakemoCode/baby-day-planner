# §F59 — Unify write-path id conventions for slot-keyed events + orphan cleanup

**Source**: Jake, 2026-05-22 (chat: "drawer bug"). Follow-up to PR #232.

**Status**: `in-progress` — **premise partially stale (see banner)**

> **⚠️ Stale-premise correction (2026-06-02).** Two of the original writer
> rows below cited `NapActionButton.tsx`, which was **removed entirely** when
> ADR-0001/ADR-0003 collapsed the per-action "Start X Now" buttons into the
> dashboard contextual button. The "Start Nap Now" path is gone (naps
> auto-promote at Now-cross — ADR-0006); the surviving end-nap path is
> `handleEndNap` in `page.tsx`. Separately, **ADR-0007 superseded the bottle
> half of "Option A"**: renumberable bottles key their doc id off `startTime`
> via `recordedIdForEvent`, *not* bare `recorded_${eventKey}`. The current live
> sites and the open work are restated below; this item is being revisited as
> the "realization seam" candidate in the architecture review.

**What**: The remaining writers that commit a projected event to a recorded
Firestore doc use *divergent* id-resolution, and one constructs lifecycle inline:

| Caller | Doc id written | Note |
|---|---|---|
| `useDrawer.onSave` (drawer edits on projected) | `recordedIdForEvent(event)` | authoritative — bottles key off `startTime` (ADR-0007) |
| `handleEndNap` (`page.tsx`, contextual button) | `recordedIdFor(event.eventKey)` | **wrong sibling** — safe only because it fires for nap/bedtime (non-renumbering) |
| `EventEditDrawerV3` change-to-bedtime confirm | `recordedIdFor("bedtime")` + hand-built `lifecycle` | bypasses `reduceLifecycle` (a 3rd lifecycle author) |

PR #232 hides duplicate docs at the render layer; this fast-follow still wants to
eliminate the orphan write at the source.

**Direction (corrected)**: all commit-as-recorded sites resolve their durable id
through the single `recordedIdForEvent` (ADR-0007), and lifecycle is authored only
by `reduceLifecycle` — never hand-constructed. Fewer breaking changes for existing
data than flipping the drawer to bare-eventKey.

**Also**: one-time read-side migration that detects duplicate `(type, eventKey)` doc pairs and deletes the loser (PR #232's policy: most-recent annotation wins, stable id tie-break). After this lands, the render dedup in `renderProjection.ts` becomes a defensive net rather than the primary fix.

**Why fast-follow**: PR #232 closes the user-visible symptom; the root cause is real but not urgent now that the symptom is gone.

**Estimated effort**: ~2–3 hr (single PR for convention + migration).

**Acceptance**:
- `grep -rn "id: \"nap_\|id: \"bedtime\"\|id: mode.projected.eventKey" src/` returns zero matches in production code.
- New integration test: drawer-edit followed by end-nap (contextual button) on the same slot produces exactly one Firestore doc.
- One-time migration deletes orphan loser docs on day load.

---


