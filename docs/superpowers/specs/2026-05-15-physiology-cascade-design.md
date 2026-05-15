# Physiology cascade — design

**Date**: 2026-05-15
**Author**: Jake / Claude
**Branch target**: fresh `feat/v3-physiology-cascade` off `main`
**Supersedes**: closed PR #144 (chronological-cascade spec) and PR #145 (impl)

## The model in plain English

1. **Baby naps fill the day until bedtime.** No fixed slot count. After every nap, baby is awake for a while, then needs another nap. This continues until the body's circadian system says "it's bedtime now."
2. **Once bedtime hits, it's all bedtime.** Sleep starting at or after the bedtime threshold IS the day's bedtime. Wake-ups during the night are normal interruptions, not new naps.
3. **Parents adjust by editing existing chips.** If reality diverges from the projection (longer nap, late nap, skipped nap), the parent edits the projected nap chip via the drawer. They never *add* a nap as a separate gesture — there's no "extra nap" concept.

This is the spec the engine is supposed to fit.

## Step-back rationale

Two prior PRs (`d15731f`, `4231f39`) and the closed PR #145 patched the symptoms of an overgrown abstraction: `wakeWindowsMinutes.length` as a slot-count cap created the "off-pattern nap" category that needed UUID eventKeys, hybrid cascade matchers, and post-threshold coercion. None of those concepts exist in the model above. The patches were carving exceptions for a case the abstraction was never the right shape for. Per `~/Workspace/.claude/rules/step-back.md`: collapse, don't layer.

## Design

### R1 — Cascade walks until bedtime threshold

| Today | After |
|---|---|
| Cascade iterates `for i in 0..wws.length-1` — slot count is hard cap. | Cascade walks `while true` until next projected nap would cross `bedtimeThreshold` → emit bedtime, stop. |
| WW length = `wws[i]`. | WW length = `wws[Math.min(rhythmN-1, wws.length-1)]` — repeats the last value beyond the configured array. |
| `nap_N` eventKey only valid for `N ≤ wws.length`. | `nap_N` valid for any `N ≥ 1`. Slot identity = chronological position in the day. |

Slot-keyed real naps (`nap_N` eventKey) still claim slot N — preserves drawer-edit + Start-Nap-promotion semantics. No additive UUID path.

### R2 — Post-threshold sleep coerces to bedtime via parent prompt

| Path | Behavior |
|---|---|
| Drawer-edit moves a nap's `startTime` from `< threshold` to `≥ threshold` at Save | Show prompt: **"Change to bedtime?"** Yes → replace nap doc with bedtime doc (carry over owner, notes, etc.). No → save as nap; cascade continues from `nap.endTime` and emits projected bedtime per R1. |
| Drawer-edit on already-past-threshold nap (no time change crossing) | No prompt. Owner-only edits don't re-prompt. |
| Drawer-edit moves bedtime back to before threshold | No prompt. Bedtime is authoritative regardless of threshold (R7.7). |

The prompt only fires on the *crossing* gesture — the moment the parent declares "this nap is intentionally past threshold."

### R3 — No FAB Add Nap

The Floating Action Button drops the nap option entirely. Bottles, pumps, extras stay. Parents who want to record an unplanned nap edit the next projected nap chip via the drawer.

| Implication | Action |
|---|---|
| `createEventTemplate.ts` — drop `type === "nap"` branch entirely | Schema unchanged; `CreatableType` stays as is, the FAB UI just doesn't surface "nap" as an option. |
| `nextFreeSlot('nap', ...)` slot-scan | Delete (still used for bottles, scope-limited). |
| `4231f39`'s UUID-for-past-maxSlot branch | Delete (was the workaround for FAB-past-cap). |

### R4 — Dashboard CTA swaps at threshold (§F8 in this campaign)

| Condition | Primary CTA |
|---|---|
| `nowMinutes < bedtimeThreshold` AND no in-progress nap | "Start Nap Now" — promotes `nextProjectedNap` (slot-keyed). |
| `nowMinutes ≥ bedtimeThreshold` AND no in-progress nap AND no manual bedtime | "Start Bedtime Now" — creates a bedtime doc (`eventKey: "bedtime"`, `lifecycle: { state: "started", committedAt: nowMinutes }`). |
| Else (in-progress nap) | "End Nap" (unchanged). |

`NapActionButton`'s UUID fallback path (`NapActionButton.tsx:53-56`) is removed — `nextProjectedNap` is always defined within-day under R1, and past threshold the CTA is "Start Bedtime Now" instead.

### R5 — Templates use the same model

`OwnershipTemplate.napOwners` is a sparse array indexed by chronological nap position. Cascade extends past `napOwners.length` per R1; positions beyond the array are simply unowned. No special template behavior for the new model.

### R6 — Block z-index (cherry-pick from closed PR #145)

Stacking order back→front: `wake_window (1) → nap, bedtime (2) → putdown (3) → extra (4) → pump (5)`. Independent of cascade model; salvaged from `96e5531` to fix pump-rendering-behind-sleep.

## Domain doc updates

- `DOMAIN.md` §1: reword "wake windows are soft targets" — add explicit statement that the configured array is a *cadence* sequence, not a per-day slot count. Naps continue until bedtime threshold using the last cadence value.
- `DOMAIN.md` §3: add explicit "wake events during the bedtime block are normal interruptions, not new naps."
- `docs/v3/ENGINE_SPEC.md`: replace R3.1 to describe cascade-until-threshold + cadence-extension. Drop R7.4b (no nap_5 cap — cap doesn't exist).

## Out of scope

- §F18 (retroactive wake-time edit) — already covered by drawer-edit on first projected wake event.
- Render layer changes for past-threshold "leave as nap" — no special styling; nap chip renders as nap. Default behavior is correct.
- Overnight wake event recording — out of scope; bottles inside bedtime use the existing dream-feed-label pass; explicit wake duration logging is not modeled.
- Multi-day planning past threshold UX (e.g., user planning tomorrow's bedtime) — same model applies, no special treatment needed.

## Contaminated data

None for production (no users beyond Jake/Kelly). Local emulator state is contaminated from the prior click-tests; wipe before verifying.

## Risks

- **Cascade-while-loop without configured upper bound.** R1 walks until threshold. Need a defensive cap (e.g., `rhythmN > 48`) to prevent infinite loop on pathological inputs (e.g., `bedtimeThreshold ≥ 48h`). Cap is engine-internal, not user-visible.
- **Nap-to-bedtime replace touches two repository writes** (delete nap doc + create bedtime doc). Wrap in a transaction or accept brief intermediate state. Fast-follow if intermediate state is visible.
- **Existing tests:** the slot-keyed cascade tests (R3.4/R3.5/R3.6/etc.) still pass since slot-keyed semantics are preserved. New tests needed for cascade-extends-past-array, prompt-trigger semantics, and FAB-no-nap-option. R7.4b "no nap_5 emitted" test gets DELETED (the cap doesn't exist).

## Acceptance

- FAB has no nap option.
- A day with `wakeWindowsMinutes = [120, 90]` projects naps until bedtime threshold using the last WW (90 min) repeated indefinitely.
- Drawer-editing a nap to past threshold prompts "Change to bedtime?" — Yes replaces with bedtime doc; No keeps nap and cascade emits subsequent WW + projected bedtime.
- Dashboard CTA swaps to "Start Bedtime Now" when `nowMinutes ≥ bedtimeThreshold`.
- Pumps render in front of sleep blocks.
- All existing tests pass after the cascade rewrite + test cleanup.
