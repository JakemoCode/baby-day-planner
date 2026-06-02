# §F66 — Bottle cascade & identity collapse: implementation scope

**Status**: scope (pre-implementation). Grill closed 2026-06-01; revised after an
adversarial audit of this doc — see
`docs/v3/fast-follow/grill/f66-cascade-and-state-model-audit.md` and ADR-0006/0007.

**Model** (settled): **reality wins** — future = projected, past = recorded; the
engine emits no *projected-lifecycle* event in the past (it promotes, ADR-0006);
adjustments re-cascade **future only**. A forecast that crosses Now is **promoted
to `recorded` AND persisted** (so it survives in history and the zero-edit case
sticks) — under a **deterministic, renumber-independent doc id**, never the
renumbering `eventKey`. **Feeds move, they don't skip** — cascade bottles are
edited, never suppressed.

Durable id by create-mode (ADR-0007): `recorded_bottle_t<startTime>` for
auto-promoted bottles (client-deterministic → concurrent devices converge to one
doc), `<type>_<uuid>` for deliberate FAB/pump creates, `recorded_<eventKey>`
retained for naps/bedtime (their keys don't renumber).

**What's being fixed**: the bottle zombie family (#6a/#6e/#8) + the §F59 id
convention + owner-state keyed off the renumbering eventKey. Reconciles all 13
audit findings (S1–S7, N1–N6). Everything else in §F66 is stale or peripheral.

## Sequenced PRs (2)

### PR 1 — Full-day bottle cascade (engine-only) — ✅ DONE (#300)

R5.1 forward-from-latest → full-day emission (match naps R3.1): the chain spans
`[wakeBuffer, cap)` with recorded bottles as in-chain anchors; a recorded bottle
**absorbs** the forecast slot within one interval of it. Pure in `(anchors,
settings)` ⇒ idempotent (canCascade compares to the recomputed schedule). Past
emits auto-promote to `recorded`. Preserves overnight-no-anchor (§F54), §F62 seed
guard, nap-snap, `bottlesPerDay`-is-a-cold-start-target, midnight cap.
**No write-path change; no contaminated data.**

### PR 2 — Stable-id persistence + owner re-keying + migration (write-path)

**Keep `useAutoPromotePersistence`** (promotion-to-persisted is wanted — history
+ zero-edit). The fix is the **id**, not the hook:

- Auto-promoted bottles persist under **`recorded_bottle_t<startTime>`**
  (deterministic) instead of `recorded_<eventKey>`. The drawer's projected-bottle
  save and `drawerDeletePolicy` reset-detection use this for **bottles only**;
  **naps/bedtime keep `recorded_<eventKey>`** (`recordedIdFor` is *not* removed).
- Edits update the existing doc in place (id frozen at first persist).
- **Owner durable state off `eventKey`:** R12.6 owner-by-index maps by
  **chronological position** (matches its spec); `Day.ownerOverrides` (R12.10) +
  owner-only-edit key off the stable id.
- `eventKey`/`bottle_N` stays the renumberable slot/role label — never a doc key.

**Why multi-client-safe:** two devices auto-promoting the same feed compute the
*same* `recorded_bottle_t<startTime>` id → write the **same doc** (converges),
not two orphans. The zombie is impossible by construction.

**Test seams:** multi-pass project→auto-promote→edit→reproject yields exactly one
bottle per feed (zombie regression); two-client simulation converges to one doc;
owner-by-index maps by clock position under the full-day cascade; cluster-feed
(two close *recorded* bottles both survive); bottle-volume invariant
(Σ = recorded amounts + projected defaults).

**Contaminated data:** existing `recorded_bottle_<N>` bottle docs → one-time,
**deterministic** migration to `recorded_bottle_t<startTime>` (two clients
converge; idempotent). Run against a captured **real Jun-1 export** to confirm
the shape first. Existing no-owner zombie orphans: once this lands they stop
regenerating, so a one-shot delete (or manual) finally sticks (the reason it
didn't before — issue #8 — was regeneration). Nap/bedtime docs are **not**
migrated.

## Not in this collapse

- **Skip/suppression** — dropped. Babies don't skip feeds (they move/shrink/extra);
  cascade bottles are edited, not deleted. (Dream-feed/recurring suppressions stay.)
- **#6g** — cold-start cap may stop short of `bottlesPerDay`; focused bug fix.
- **#7** — transient inline validation message; trivial UI polish.

## Audit-finding disposition (S1–S7, N1–N6)

| Finding | Resolution |
|---|---|
| S1/N6 retire recordedIdFor breaks naps | Bottle-scoped; naps/bedtime keep `recorded_<eventKey>` |
| S2/N5 migration unsafe / dedup can't catch | Deterministic target id → idempotent, multi-client-safe |
| S3 PR1-alone amplifies | Reframed: keep hook, stabilize id; PR1+PR2 are the fix together |
| S4 skip key undefined | Dropped — feeds don't skip |
| S5 owner-by-index slot vs position | Map by chronological position (matches spec) |
| S6 absorption eats cluster feed | Non-issue (recorded feeds are anchors, survive) + test |
| S7 #6d volume / cleanup | Volume invariant test; deterministic migration + real-data export |
| N1/N2 auto-promote anchoring / oscillation | Stable id → deterministic anchor, idempotent (best-guess = reality, intended) |
| N3/N4 owner-override ordering / dual identity | Folded into PR2 (owner state off eventKey) |
