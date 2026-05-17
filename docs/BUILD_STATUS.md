# Build Status

> Last refresh: 2026-05-16
> Repo: `github.com/JakemoCode/baby-day-planner`

## Where we are

The app runs locally against the Firebase emulator suite. Sign-in works
(Google emulator + email allowlist). Dashboard, Timeline, Tomorrow,
History, ArchivedDay, and Settings pages all render on V3.

**V3 engine is the single runtime** as of PR-C1 (2026-05-11). V2 was
wiped wholesale — no back-compat shim, no V2 hooks, no V2 components.
Post-cutover bug-fixes and feature restorations are tracked in
`docs/v3/FAST_FOLLOW.md`.

**Physiology cascade landed (PR #149, 2026-05-15)** — `wakeWindowsMinutes`
is now a cadence sequence (cascade extends to bedtime threshold using
the last WW value); FAB drops the nap option; drawer prompt converts
past-threshold nap edits to bedtime; dashboard CTA swaps to "Start
Bedtime Now" past threshold; pumps render in front of sleep blocks.
See `docs/superpowers/specs/2026-05-15-physiology-cascade-design.md`.

**Lifecycle simplification + slot ids landed (2026-05-16 campaign,
PRs #165 → #168)** — major reshape of how naps + bedtime persist:

- Slot events use deterministic ids (`id === eventKey === "nap_1"`,
  `"nap_2"`, `"bedtime"`). Eliminates the §F22/F24/F25 bug class.
- Lifecycle vocabulary: `projected | recorded | completed`. `started`
  dropped; `overridden` renamed to `recorded`. "In progress" is now
  a TIME property (`startTime ≤ now < effectiveEnd`), not a state.
- Auto-extend: `effectiveEndOf(event, napLen, now)` extends an
  in-progress recorded nap past its placeholder endTime, capped at
  3 extensions (= `startTime + 4 × napLen`). Render-only — cascade
  cursor uses raw endTime.
- "Start Nap Now" / "Start Bedtime Now" mint full events with
  endTime placeholders (`now + napLen` and `nextDayAt(defaultWakeTime)`
  respectively); "End Nap" / "End Bedtime" do `TIME_EDIT → completed`.
- Render pipeline (`src/v3/ui/renderProjection.ts`) has three passes:
  dream-feed-label → effectiveEnd-bake → putdown-expand. R6.8 gate
  suppresses putdown chips inside in-progress sleep blocks.
- Legacy lifecycle migration at the read seam: pre-#166 `started`
  and `overridden` docs auto-rewrite to `recorded` on load.
- `inProgressNap` / `inProgressBedtime` selectors detect via shared
  `isInProgress` predicate from `src/v3/lib/effectiveEnd.ts`.
- NapActionButton CTA always actionable (defaults to "Start Bedtime
  Now" when nothing else applies); `primary` variant for visibility.

Wave 9 (PWA manifest + service worker + E2E + design audit) is the
last build wave on the original Plan C roadmap. Not yet started.

## Tomorrow's resume notes (2026-05-17)

**Confirmed merged today (2026-05-16):** #165, #166, #167, #168. All
on `main`. 639 unit + 35 integration tests passing.

**PR open awaiting merge:** #169 (docs-only: adds §F32 to FAST_FOLLOW).

**Things to be aware of:**

- The 2026-05-16 lifecycle simplification reshaped the data model.
  Wipe the local emulator before testing (or trust the migration at
  the read seam). Pre-#166 fixtures still in the codebase will be
  auto-migrated on read.
- `feedback_seam_coverage_required.md` memory: two bugs shipped
  through the unit suite today (PR #166 + the bedtime CTA bug). The
  Playwright E2E tier (deferred for V1) is the right safety net;
  until then, when implementing a CTA-driven flow, add a seam test
  using REAL projectDay + REAL renderProjection.
- `feedback_parallel_agent_workspace.md` memory: parallel agents
  share the working tree. WIP edits in one agent can break unrelated
  branches' pre-push typecheck. Defer cross-branch ops until in-flight
  agents finish (or use distinct branch names; or worktree per agent).

**Likely next priorities (in roughly the order Jake last weighed
them):**

1. **§F32 — retire `EndOfDayCard`, dashboard always shows stats**
   (Jake's request today; will need design call on the stats panel
   content + the wake-gate replacement UI)
2. **§F2 palette refresh** (🔥 flagged twice; surface contrast
   ~1.05 right now → secondary buttons visually invisible against
   page background; today's NapActionButton fix was a quick variant
   swap, the systemic fix is still pending)
3. **§F3 onboarding + §F10 child name/DOB** (first-time user UX;
   blocks any non-Jake user)
4. **Deploy to dogfood** (production Firebase + Vercel + smoke test
   → ~1-2 evenings; see earlier session for the minimum-deploy plan)

**Things that came up but weren't scoped:**

- Bedtime soft-end uses `napLen` (per `effectiveEnd.ts` JSDoc) —
  technically wrong for bedtime which extends to next-day wake. Not
  observable today (cascade emits no putdown-eligible events past
  bedtime) but flagged in code comments for a future change.
- NapActionButton name is stale (handles naps + bedtimes + default
  bedtime mode). Renaming considered + deferred.
- Pre-existing clock-skew between NapActionButton prop `nowMinutes`
  and inline `currentLocalMinutes()` (PR #162 reviewer note I5);
  not pursued.

## Active backlog

Authoritative source: `docs/v3/FAST_FOLLOW.md` (§F1 onward). Items
shipped post-cutover are condensed in `docs/v3/FAST_FOLLOW_COMPLETED.md`.

## Decisions locked (do not re-ask)

- **Auth**: Google sign-in via Firebase, email allowlist (`jake136@yahoo.com`, `kellyrbarber@gmail.com`). Sticky persistence — sign in once per device, ~forever.
- **Theme**: Earth-tone palette (sage / terracotta / warm cream / dusty blue / coral). **Light mode only** — dark mode disabled in `tokens.css` (re-enable by uncommenting the `@media (prefers-color-scheme: dark)` block).
- **Time format**: 12-hour AM/PM in UI; engine internal is integer `TimeMin` (minutes since midnight, `≥1440` for cross-day).
- **Touch targets**: spacious (≥44pt), silent UI on actions, error-only toasts.
- **Editing**: tap an event on `/timeline` to open the edit drawer. Read-only view on `/history/[date]` with explicit edit affordance per event.
- **Day Templates**: day-picker (Sat/Sun), timeline rendering, inline owner picker beneath tapped event. Bottle slots derived from settings.
- **FAB type picker**: bottom-sheet, includes Custom (== extra), past-times today only.
- **Engine philosophy** (V3 §0): **predict, don't prescribe.** Engine output is a forecast; bedtime, naps, intervals all flex with reality. Recorded events win — never refuse a save because it conflicts with a projection.
- **Branch protection**: `main` requires PR + passing CI on `JakemoCode/baby-day-planner`. Direct pushes blocked.

## Known runtime gotchas (don't re-litigate)

1. **`process.env.NEXT_PUBLIC_*` direct property access only** — Next.js inlines at compile time. `process.env[name]` ships unchanged and reads as undefined in the browser. Documented in `src/lib/firebase/client.ts` header.
2. **No Proxy on Firestore handles** — SDK does `instanceof` checks on the handle internally; Proxy fails them. Documented in `client.ts` header.
3. **Each Firebase service connects its own emulator at init time** — a global "connect both" guard was a bug because AuthProvider mounts before Firestore is touched.
4. **`exactOptionalPropertyTypes: true`** — never assign `undefined` to an optional field; omit the key (`{ ... }` not `{ key: undefined }`). Use destructure-omit (`const { key: _omit, ...rest } = obj`).
5. **React 19 lint rules**:
   - `react-hooks/set-state-in-effect` — don't sync prop → state in `useEffect`. Use `key` prop pattern or derive directly.
   - `react-hooks/purity` — no `Date.now()` etc. in render. Use lazy `useState(() => Date.now())` or compute in handlers.
6. **`vitest.setup.ts`** sets default Firebase env vars so module-load doesn't crash in unit tests.
7. **Pre-push hook** runs emulator-backed integration tests. Reuses any emulator already on `:8080`; otherwise boots one via `firebase emulators:exec`. Use `pnpm test` (not `npx vitest run`) for the same harness CI uses — `npx vitest run` exposes a flaky `uniqueRecordedKeys` test from order pollution that `pnpm test` does not.
8. **`useEvents` skips subscription when `dayId` is empty** — placeholder strings like `"__no_day__"` were rejected by Firestore as reserved.

## Project conventions reminder

- `.toBeInTheDocument()` is **banned**. Prefer `.toBeVisible()` or behavior assertions. Codified in `frontend-orchestration` plugin's `standards/testing.md`.
- CSS Modules + `tokens.css` only — no inline styles, no runtime CSS-in-JS.
- E2E tests are immutable; fix the component, never the test.
- Per-component branch + PR; never commit directly to main. **Always branch off fresh `origin/main`** — see workspace `git.md` rule.

## How to resume

```bash
# Terminal 1
firebase emulators:start --only auth,firestore --project baby-day-planner-local

# Terminal 2
cd ~/Workspace/baby-day-planner
git checkout main && git pull
rm -rf .next
pnpm dev
```

→ `http://localhost:3000` → sign in as `jake136@yahoo.com` (emulator popup) → app fully usable.

## Resuming with Claude

```
/session-start
```

The skill reads `UI_REQUIREMENTS.md` + `COMPONENT_INVENTORY.md` + this file.
For active backlog and next-action triage, read `docs/v3/FAST_FOLLOW.md`.
