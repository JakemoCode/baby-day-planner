# §F59 — Unify write-path id conventions for slot-keyed events + orphan cleanup

**Source**: Jake, 2026-05-22 (chat: "drawer bug"). Follow-up to PR #232.

**Status**: `in-progress` — **design-locked 2026-06-03; ready to build (see Implementation plan)**

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
by `reduceLifecycle` / the `recordedLifecycle` factory — never hand-constructed.
Fewer breaking changes for existing data than flipping the drawer to bare-eventKey.

---

## Implementation plan (design-locked 2026-06-03, realization-seam grill)

Shape **A — primitives-first + carve-out** (no new module): the shared kernel is
already single-sourced (`recordedIdForEvent`), so this is mechanical fixes plus two
enforcement moves, not a new abstraction. The verb for the whole operation is
**realize** (see [CONTEXT.md](../../../../CONTEXT.md) glossary). Each row carries its
traceability anchor so the code can cite §F59 and §F59 cites the guiding doc.

| # | Change | Where | Traces to |
|---|---|---|---|
| 1 | Canonicalize the "is-projected" check on `isEngineEmittedId`; `useDrawer.isActual` → `!isEngineEmittedId(event.id)` | `useDrawer.ts`, `eventConventions.ts` | provably ⇔ `!actuals.some(id)` **under** BOTTLE_SPEC §3.1 (ephemeral projections) |
| 2 | **Write-seam guard**: `v3EventConverter.toFirestore` throws on any `proj_` id ("refuse to persist an unrealized projection") | `firestore/converters.ts` | enforces BOTTLE_SPEC §3.1; makes #1 ground-truth, not heuristic; regression net for the zombie/flicker class (BOTTLE_SPEC §2) |
| 3 | `handleEndNap` uses `recordedIdForEvent`, not `recordedIdFor(event.eventKey)` | `page.tsx` | ADR-0007 (one durable-id resolver). **No data change** — identical `recorded_nap_N` for non-renumbering slots |
| 4 | Add `recordedLifecycle(annotatedAt)` (+ `projectedLifecycle`/`completedLifecycle`) returning the strict `Lifecycle` union; replace **all three** inline `recorded` authors | `lifecycle.ts`; callers `EventEditDrawerV3.tsx`, `forecastSnapshot.ts`, `evaluator.ts` | DATA_MODEL R2.1; shape = type-enforced by the discriminated union, authorship = convention (no branded type — disproportionate churn into the pure engine/tests) |
| 5 | bedtime-confirm uses `recordedLifecycle(now)` — **behavior-preserving** (same value it hand-builds today) | `EventEditDrawerV3.tsx` | future-recorded edge deferred to [§F75](../grill/f75-bedtime-confirm-future-recorded.md) |

**Coverage note**: the #2 guard fires on `setDoc` (the realization boundary — always a
full write). `updateDoc` (time/volume edits on already-realized docs) bypasses the
converter, which is harmless: an event reaching `updateDoc` is in actuals, so its id
already passed the guard at creation.

**Contaminated data**: **none / waiver.** #3 writes the identical id existing code
already writes for nap/bedtime; #1/#2/#4/#5 change no persisted shape. (#2 may make
pre-existing `proj_`-id test fixtures throw — that's a test update, not prod data.)

**Tests** (seam-level, per AGENTS.md): (a) drawer-edit a projection → realized doc →
next `projectDay` has no duplicate; (b) end-nap → engine next cycle (the documented
gap); (c) `toFirestore` rejects a `proj_` write. Update `proj_`-persisting
fixtures (zombie-repro/scratch) to realize-first or expect the throw.

**PR shape**: one cohesive PR (the whole realization seam); test updates land with it.

**Also**: one-time read-side migration that detects duplicate `(type, eventKey)` doc pairs and deletes the loser (PR #232's policy: most-recent annotation wins, stable id tie-break). After this lands, the render dedup in `renderProjection.ts` becomes a defensive net rather than the primary fix.

**Why fast-follow**: PR #232 closes the user-visible symptom; the root cause is real but not urgent now that the symptom is gone.

**Estimated effort**: ~2–3 hr (single PR for convention + migration).

**Acceptance**:
- `grep -rn "id: \"nap_\|id: \"bedtime\"\|id: mode.projected.eventKey" src/` returns zero matches in production code.
- New integration test: drawer-edit followed by end-nap (contextual button) on the same slot produces exactly one Firestore doc.
- One-time migration deletes orphan loser docs on day load.

---


