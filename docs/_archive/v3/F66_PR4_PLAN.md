# §F66 PR 4 — Multi-modal dashboard button

## Context

§F66 collapses three independent dashboard "Start X Now" buttons (Start Bottle, Start Nap, Start Bedtime) into a single contextual button slot per ADR-0001 + ADR-0003. The engine-side Now-cross auto-promote already shipped in PR #255 (commit `121d075`) — it flips any projected event whose time has passed to `recorded`, so the "Start X Now" CTAs are now dead code: tapping them duplicates work the engine does automatically.

What survives:
- **End Nap** — closes an in-progress recorded nap by setting `endTime = Now` (engine can't auto-detect that baby actually woke up).
- **Log Bottle Time** — records a bottle at Now ± up to 15 min of a projected bottle's startTime, in case baby ate slightly earlier/later than the cascade predicted.
- **End overnight sleep** — kept (per user grill) but with a fixed lifespan: visible only until the first projected bottle's Log Bottle window opens. After that it disappears; late closure goes through the drawer.

Goal: ship the contextual button + remove the three dead CTAs in one PR. Tasks 4.1/4.2 from `F66_PLAN.md` are retired (engine-side promotion subsumes render-side helper).

## Branch + worktree

PR 4 branches off fresh `origin/main` (last commit `fbe7259` = #256). Worktree at `.claude/worktrees/f66-pr4-multimodal-button`, branch `feat/f66-multimodal-dashboard-button`.

## Design decisions (from grill)

| Question | Decision |
|---|---|
| Where does "End overnight sleep" go? | Kept as highest-priority mode, but auto-sunsets at first-bottle window opening. Eliminates "stays as End overnight sleep all day" bug. |
| 5:30–6pm bedtime gap (threshold < earliestBedtime, engine won't auto-promote yet)? | Ignore — drawer handles it. No "Start Bedtime Now" carve-out. |
| Preserve `minBottleIntervalMinutes` confirm dialog for Log Bottle Time? | Drop. ±15min window is the new guard; cascade enforces interval upstream. |

## Mode-selection logic (final)

In priority order (first match wins; rest fall through to hidden):

| Condition | Mode label | Action |
|---|---|---|
| `inProgressBedtime` exists AND no projected bottle has entered its Log Bottle window yet | **End overnight sleep** | Open existing wake-confirm sheet (`setWakeSheetOpen(true)`) |
| `inProgressNap` exists (start ≤ Now < end) | **End Nap** | `onEndNap(nap, Now)` — TIME_EDIT → completed |
| Projected bottle exists with `|Now − startTime| ≤ 15min` AND no in-progress nap | **Log Bottle Time** | Write recorded bottle at Now, default amount, promoting `nextProjectedBottle.eventKey` (mirrors current StartBottleButton.buildBottle minus confirm) |
| Otherwise | hidden | — |

"First-bottle-window-opened" sunset = a `Now ≥ firstProjectedBottle.startTime − 15` check (the lower edge of the Log Bottle window). Once true, End overnight sleep disappears even if `inProgressBedtime` still exists.

## Precondition: wire `earliestBedtime` into settings UI

PR #249 shipped `earliestBedtime` in `settingsDefaults.ts:32` (18:00) and the `Settings` schema, but the settings page never got the matching `TimeRow`. PR 1 Task 1.2 was missed. Folding the fix into this PR per user direction.

**Modify `src/app/(signed-in-with-child)/settings/page.tsx`:**
- Add a `TimeRow` for `earliestBedtime` directly after the existing `bedtimeThreshold` row (around line 93). Pattern matches the surrounding rows.
- Relabel the `bedtimeThreshold` row: `label="Latest nap end (bedtime threshold)"` and helperText: "If a projected nap would end past this, drop it — bedtime takes over at earliest bedtime."
- New row's label: "Earliest bedtime", helperText: "Floor for projected bedtime — engine never projects bedtime before this."

This is mechanical; no test needed beyond the existing settings render test (verify it still renders + the new row's `id` exists). If a settings-page unit test exists at `src/app/.../settings/page.test.tsx`, add one assertion that `getByLabelText(/earliest bedtime/i)` resolves.

Manual click-test: open `/settings`, scroll to bedtime section, confirm both rows present and default values render (5:30pm + 6:00pm).

## File plan

**Create:**
- `src/v3/components/Dashboard/ContextualActionButton.tsx` — one component owning the mode-selection logic + dispatch. Replaces `NapActionButton.tsx` and `StartBottleButton.tsx`.
- `src/v3/components/Dashboard/ContextualActionButton.test.tsx` — unit tests for `decideMode` (table-driven by scenario) + render tests for each mode's label/handler wiring.

**Modify:**
- `src/app/(signed-in-with-child)/settings/page.tsx:~93` — add `earliestBedtime` TimeRow + relabel `bedtimeThreshold` (see Precondition section above).
- `src/app/(signed-in-with-child)/page.tsx:246-275` — replace the two-button block with a single `<ContextualActionButton ...>`. Pass `inProgressNap`, `inProgressBedtime`, `nextProjectedBottle` (=`nb`), in-progress detection still done at page level. Keep the existing `handleEndNap`, `handleLogBottle`, `setWakeSheetOpen` handlers — wire them into the new component's props.

**Delete:**
- `src/v3/components/Dashboard/NapActionButton.tsx`
- `src/v3/components/Dashboard/StartBottleButton.tsx`
- Their test files if any.
- `src/app/.../page.tsx` handlers that become unreachable: `handleStartNap`, `handleStartBedtime` (and their callers' wiring). Inspect carefully before deleting — `handleStartBedtime` may have unique behavior. If it's a thin `saveEvent` wrapper, delete.

## TDD sequence

Vertical-slice TDD per workspace rule. One test → minimal impl → next test. Do NOT write all tests then all code.

### Slice 1: `decideMode` pure function

Extract mode-selection as a pure function from the start so it's testable without rendering.

```ts
export type ContextMode =
  | { kind: "end-bedtime"; bedtime: Event }
  | { kind: "end-nap"; nap: Event }
  | { kind: "log-bottle"; projected: Event }
  | { kind: "hidden" };

export function decideMode(args: {
  inProgressBedtime?: Event;
  inProgressNap?: Event;
  nextProjectedBottle?: Event;
  nowMinutes: TimeMin;
}): ContextMode { ... }
```

Tests (one at a time, RED→GREEN per case):
1. No state → hidden
2. inProgressNap only → end-nap
3. inProgressBedtime only, Now well before first-bottle window → end-bedtime
4. inProgressBedtime exists but `Now ≥ nextProjectedBottle.startTime - 15` → falls through (NOT end-bedtime; bottle wins if conditions met)
5. nextProjectedBottle within ±15min, no nap, no bedtime → log-bottle
6. nextProjectedBottle within ±15min AND inProgressNap → end-nap (nap wins per priority)
7. nextProjectedBottle 20min away → hidden
8. nextProjectedBottle 16min before now (just past window) → hidden
9. Same as case 3 but the projected bottle is 14min away (window open) → hidden for end-bedtime, log-bottle wins

### Slice 2: Component renders correct label per mode

Render `<ContextualActionButton>` with mocked props for each mode; assert `screen.getByRole('button', { name: /End Nap/i })` etc. For hidden, assert `queryByRole('button')` is null.

### Slice 3: Handlers fire correctly

- End Nap mode → click → `onEndNap` called with `(inProgressNap, currentLocalMinutes())`
- End overnight sleep mode → click → `onWakeRequest()` called (no args)
- Log Bottle mode → click → `onLogBottle(bottle)` called; bottle has `startTime = currentLocalMinutes()`, `amountOz = defaultBottleAmountOz`, `eventKey = nextProjectedBottle.eventKey`, `id = recorded_${eventKey}`, `lifecycle: { state: "completed", committedAt: startTime }`. Mirrors existing `StartBottleButton.buildBottle` minus confirm dialog.

Reuse the existing `buildBottle` body (it's stable; §F59/§F60 eventKey-promotion is already correct). Just inline it into the click handler.

### Slice 4: Page integration

- [ ] Replace the two-button block in `page.tsx`.
- [ ] Delete `NapActionButton.tsx`, `StartBottleButton.tsx`, plus their tests.
- [ ] Run `pnpm test` — fix any test importing the deleted modules.
- [ ] Run `pnpm typecheck` (or `tsc --noEmit` via the project script — confirm command in `package.json`).

### Slice 5: Seam coverage test

Per the testing-discipline rule and `feedback_seam_coverage_required`: action-chain features need at least one seam-level integration test. Add a real-engine-and-renderProjection integration test in `tests/integration/contextualButton.test.ts` (or co-located if seam-style tests live elsewhere):

- Seed an in-progress nap in Firestore emulator, run renderProjection at Now = nap.startTime + 15min → assert `decideMode` (called on the rendered output) returns `end-nap`.
- Seed only a projected bottle at Now + 5min, no naps → assert returns `log-bottle`.
- Same projected bottle, but with an in-progress nap → assert returns `end-nap` (overlap precedence per CONTEXT.md).

Use the existing `startTestEnv()` from `tests/integration/firestore-test-utils.ts`. Mirror the patterns in `src/v3/repositories/*.test.ts`.

## Verification

Pre-commit per slice:
- `pnpm test` — full unit suite green (currently 751 passing; this PR removes ~30, adds ~25).
- `pnpm typecheck` — clean.
- `pnpm test:integration` — emulator-backed seam test green.

Click-test (paste into PR body and chat):
1. Start dev server: `cp ../../../../.env.local .env.local && PORT=3001 pnpm dev`
2. Open http://localhost:3001 with seeded day, settings at defaults
3. **Hidden state**: with no in-progress sleep and next bottle 30min+ away, confirm contextual button slot is empty (not a disabled button)
4. **Log Bottle Time**: wait until Now within 15min of next projected bottle. Button reads "Log Bottle Time". Tap → bottle records at Now with default amount, button disappears
5. **End Nap**: open drawer FAB → add nap with start=Now-15min, no endTime. Button reads "End Nap". Tap → nap's endTime updates to Now, lifecycle → completed
6. **End overnight sleep**: with active in-progress bedtime and Now well before morning bottle window, button reads "End overnight sleep". Tap → wake-confirm sheet opens. Once Now passes (first projected bottle.startTime − 15), button switches to Log Bottle Time

## Contaminated data section (for PR body)

No write-path bug being fixed here. No data migration. Existing docs are unaffected — this PR only changes which UI surfaces the user touches to write them.

## Out of scope

- Drawer changes for owner-only future edits (that's PR 5).
- Render-side `applyNowCrossPromotion` helper (retired; engine-side covers it).
- Dream feed (PR 6).
- Removing the FAB type picker / drawer add path — that stays as the catch-all for out-of-window edits.

## Review dispatch (post-push)

Per `feedback_parallel_pr_review_loop`: same turn that confirms PR is opened, dispatch both:
- `code-reviewer` (opus) with `gh pr diff <num>` content pasted into the prompt body
- `code-simplifier` (sonnet) same content

Paste the click-test steps into the chat reply alongside the PR link.
