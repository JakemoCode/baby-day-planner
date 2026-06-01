# §F66 — Bottle cascade & identity collapse: implementation scope

**Status**: scope (pre-implementation). Grill closed 2026-06-01 — see
`docs/v3/fast-follow/grill/f66-cascade-and-state-model-audit.md`.

**Model** (settled): reality wins — future = projected, past = recorded; no
projected event in the past (ADR-0006); adjustments re-cascade **future only**;
projections are never persisted (DATA_MODEL R2.2); durable identity = uuid `id`,
`eventKey`/`bottle_N` = renumberable slot/role label that never keys a doc
(ADR-0007); skip = persisted suppression.

**What's being fixed**: the bottle zombie family (#6a/#6e/#8) + the §F59 id
convention. Everything else in §F66 is stale or peripheral (see the triage).

## Sequenced PRs

Each is independently mergeable, tests-green at every step. Cascade/write-path
PRs carry a `## Contaminated data` section. **Hard ordering: PR1 before PR2** —
PR2 deletes the persistence patch, which is only safe once PR1 keeps morning
bottles alive.

### PR 1 — Full-day bottle cascade (engine-only, no write-path)

Bring R5.1 up to the naps R3.1 treatment. Today the bottle cascade, once
anchored, only walks **forward from the latest recorded bottle**, so morning
forecasts vanish when an afternoon bottle is recorded. Change it to emit the
**full day** `[wakeBuffer, cap)` with recorded bottles as in-chain anchors:
slots *before* the earliest anchor and *between* anchors are filled, not just
forward from the latest. Past-time emits auto-promote to `recorded` (ADR-0006),
so morning reality survives **without any persistence**.

- **Preserve**: "overnight bottles don't anchor" (DOMAIN §2), §F54 overnight
  sizing, §F62 cold-start seed guard, nap-snap (`snapToPutdown` etc.), the
  `bottlesPerDay` cold-start-target-not-cap rule, and the strict-monotonic /
  cap termination guards.
- **Test seams**: (a) recorded afternoon bottle + projected morning bottles all
  present in one pass; (b) full-day invariant — chain spans wake→cap regardless
  of where anchors sit; (c) existing `bottles.test.ts` stays green.
- **Contaminated data**: none (engine output only; nothing persisted changes).

### PR 2 — Stable uuid identity + delete auto-promote-persistence (write-path)

- **Delete `useAutoPromotePersistence`** and its mount in `page.tsx`.
- Recorded/adjusted bottles persist under a stable uuid `id` (`newEventId`,
  exactly like FAB-added extras and pumps). **Retire `recordedIdFor` for the
  bottle write-path** — the drawer's projected-bottle save and the reset
  detection in `drawerDeletePolicy` stop deriving the doc id from `eventKey`.
- `eventKey` (`bottle_N`) stays the slot/role label for owner-by-index (R12.6),
  template mapping, and recorded↔projected matching — never a storage key.
- **Test seams**: drawer-edit of a projected bottle creates one uuid doc (not a
  renumber-keyed one); editing again updates the same doc; multi-pass project→
  edit→reproject yields exactly one bottle per feed (the zombie regression).
- **Contaminated data**: existing `recorded_bottle_<N>` docs (incl. no-owner
  zombie orphans) — one-time migration: re-key surviving recorded bottles to
  uuid ids and drop orphans that duplicate an owner-assigned bottle. Provide a
  reconcile pass (extend/replace `reconcileDuplicateEventDocs`) + manual-cleanup
  notes for Jake's live data.

### PR 3 — Skip = suppression for regular bottles

Deleting a past bottle (forecast or recorded) persists a **suppression** keyed
by durable identity, generalizing `Day.suppressedDreamFeed` / `suppressRecurring`.
The cascade permanently omits that feed; future bottles are unaffected.

- **Test seams**: delete a past forecast → it stays gone across reproject;
  future cadence unchanged; suppression key survives renumber.
- **Contaminated data**: none (additive `Day` field).

### PR 4 — Owner-overrides / owner-only-edit off durable identity

`Day.ownerOverrides` and the owner-only-edit path key off `eventKey` today —
fine for *recorded* (frozen) bottles, fragile for a still-renumbering *projected*
one. Re-key durable owner state to the stable identity.

- **Contaminated data**: migrate any `ownerOverrides` entries keyed by a
  projected eventKey (rare); document.

## Out of scope (separate, non-model)

- **#6g** — cold-start cap may stop short of `bottlesPerDay`; a focused bug fix.
- **#7** — transient inline validation message; trivial UI polish.

These close as normal fast-follows, not part of this collapse.
