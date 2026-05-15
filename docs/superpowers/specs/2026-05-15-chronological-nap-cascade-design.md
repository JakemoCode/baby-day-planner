# Chronological nap cascade + render z-index — design

**Date**: 2026-05-15
**Author**: Jake / Claude
**Branch target**: `fix/v3-save-path-eventkey-bugs` (current PR #143) or successor branch

## Problem

Two user-reported violations on PR #143 click-test (2026-05-14):

1. **"Add Nap" displaces a projected nap.** Adding a nap via FAB causes a currently-projected nap chip to visibly move (sometimes label-swap). The button says "Add" — its end result must not be "Move."
2. **Nap chip plants on top of bedtime block.** When threshold is set near `now` and the user adds a nap, the new chip overlaps the bedtime block visually. Pumps separately render *behind* everything else.

Root cause for (1): the cascade matches real naps to slots via `existingNapByKey.get('nap_N')`. Any FAB-added nap whose `eventKey` lands on a slot that the cascade considered "free" (e.g. a slot freed by bedtime substitution) substitutes into the cascade and displaces the projection.

Root cause for (2): no `z-index` rules in `Block.module.css`. DOM order alone determines stacking, putting pumps behind newer DOM siblings.

## Domain grounding

- DOMAIN.md §1: naps are rhythm — wake → sleep → wake → sleep. The "Nth nap" is a chronological position, not a pre-assigned slot.
- DOMAIN.md §3: bedtime is the day's last sleep; "from the baby's perspective ... it's just the last sleep of the day." Any sleep starting after the bedtime threshold IS bedtime.
- DOMAIN.md §7: reality wins; predict-don't-prescribe.

## Design

### Fix 1 — chronological cascade, drop `nap_N` as a cascade primitive

The cascade walks the day in time order, anchoring on real naps regardless of `eventKey` shape.

| Aspect | Today | After |
|---|---|---|
| Match real nap to slot | `existingNapByKey.get('nap_N')` | Walk chronologically; consume the next real nap whose `startTime ≥ cursor` for the next rhythm position |
| FAB Add Nap eventKey | `nap_N` if `N ≤ maxSlot`, else UUID | **Always UUID** |
| FAB Add Nap label | `Nap N` if fits slot, else "Nap" | **Always "Nap"** (no number at create time) |
| Nap chip numbering | From eventKey | From a render-time chronological renumber pass (existing R5.4-style) |
| Bedtime substitution (projected nap) | Slot N's projected nap crosses threshold → emit bedtime, stop | Same |
| Bedtime substitution (real nap) | Slot N's real nap stays a nap | **Real nap with `startTime ≥ bedtimeThreshold` AND no manual bedtime → engine projects it as `type: "bedtime"`** (Option A: engine-coerce). The Firestore doc stays `type: "nap"`; only the projection mutates. |

The cascade-invariant test (`naps.test.ts`) still holds:
- `wake_window(N).startTime === nap(N-1).endTime` (or `Day.wakeTime` for N=1)
- `wake_window(N).endTime === nap(N).startTime`

…where `nap(N)` is now "the Nth chronological nap of the day," real or projected.

### Fix 2 — block z-index ordering

Add explicit `z-index` rules in `Block.module.css`. Document the order in the file's header comment (intent is already declared there but no rules exist).

| Type | z-index | Rationale |
|---|---|---|
| `wake_window` | 1 | Background lane |
| `nap`, `bedtime` | 2 | Sleep blocks; same family |
| `putdown` | 3 | Synthetic; reads as "transition into sleep" — sits above its host wake_window |
| `extra` | 4 | User-defined content; should always be visible |
| `pump` | 5 | Always on top — parallel parent schedule, sized to `max-content` and inset right; must not be hidden behind sleep blocks |

### Fix 3 — tests

- `createEventTemplate.test.ts`: assert FAB Add Nap returns UUID `eventKey` + label `"Nap"` regardless of recorded/projected counts. Drop the `fitsSlot` cases.
- `naps.test.ts`: new scenarios under the existing cascade-invariant block —
  - UUID-keyed real nap inserts into the rhythm chronologically; downstream projections re-cascade from it.
  - Real nap with `startTime ≥ bedtimeThreshold` projects as `type: "bedtime"`; cascade stops; no nap/WW emitted past it.
  - Real nap *before* threshold AND projected bedtime *after* threshold both render correctly (no double-bedtime).
- `Block.test.tsx`: assert each block type renders with the expected `z-index` (or computed style).
- Existing tests that depend on `nap_N` slot-matching: audit and convert to chronological assertions where appropriate.

## Out of scope

- Bottle eventKey scheme (`bottle_N` slot-keyed) — same shape of issue but separate user-facing path; defer to a follow-up if surfaced.
- `nextProjectedNap` promotion in `NapActionButton.Start Nap Now` — that path is correct (it's a deliberate "promote the projection" action). Keep as-is.
- Render-time numbering pass for naps — already exists (R5.4-style); reuse, don't redesign.
- Visual treatment for "user-added nap inside an *existing manual* bedtime block" — covered by z-index ordering; user can edit either via drawer.

## Contaminated data

None for production (no users beyond Jake/Kelly). Local emulator state is contaminated from PR #143 click-tests — wipe before verifying the fix.

## Risks

- **Behavior change to the cascade is engine-class.** Hook tests and engine tests must pass under the new chronological walk. The cascade-invariant test is the canary.
- **Label numbering shifts** for any existing scenario where a UUID-keyed nap exists alongside `nap_N` events — but no such state exists in production, and emulator is wipeable.
- **Type-coercion of the post-threshold nap (Option A)** means the projection can return `type: "bedtime"` for a Firestore doc whose persisted `type` is `"nap"`. Any consumer that compares projection `type` to doc `type` (rare) needs a sanity check.

## Acceptance

- FAB Add Nap at any time → new chip is "Nap" (no number); no existing chip's identity changes.
- Adding a nap *before* a future projected nap re-cascades the future projections (later naps shift later); user-added nap label stays "Nap" (numbering pass renumbers all chips chronologically at render).
- Adding a nap with `startTime ≥ bedtimeThreshold` (and no manual bedtime) renders as a bedtime block; cascade emits nothing past it.
- Pumps render in front of sleep blocks.
- All existing tests green; new tests cover the three scenarios above.
