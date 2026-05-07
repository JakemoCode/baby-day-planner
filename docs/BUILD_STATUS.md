# Build Status

> Updated: 2026-05-06
> Repo: `github.com/JakemoCode/baby-day-planner` (moved from Jakemo136 → JakemoCode org)

## Where we are

The app **runs locally** against the Firebase emulator suite. Sign-in works (Google emulator + email allowlist). Dashboard, Timeline, Tomorrow, History, ArchivedDay, and Settings pages all render with real data. Plans 0–C complete; **Wave 9 is the last build wave on the original Plan C roadmap.**

## Plans complete

- **Plan 0 — Bootstrap** ✅ (PR #1)
- **Plan A — Scheduling Engine** ✅ (PR #1)
- **Plan B — Data Layer** ✅ (PR #2)
- **Plan C — Frontend** ✅ Waves 0–8 (PRs #4 – #11). All 36 components + 6 pages live.

## Plans / waves remaining

- **Wave 9** — PWA manifest + service worker, E2E tests for critical flows, `/design-audit`, `/visual-qa`. Not started.

## Recently shipped (last session)

| PR | What |
|---|---|
| #12, #13 | Lazy-init Firebase client (later reverted in #16) |
| #14 | Prettier format pass |
| #15 | SignIn redirects to / when status becomes authorized |
| #16 | **Drop Proxy on auth/db** — broke Firestore SDK type checks. Eager-init with direct `process.env.NEXT_PUBLIC_*` access (Next.js compiler inlines). |
| #17 | useEvents skips subscription when no dayId (Firestore reserved-id error) |
| #18 | Mobile stacking on Weekend Templates + Start Bottle Now feedback (`✓ Bottle logged`) |
| #19 | Disable dark mode + Bottle Rules layout overflow |

## Open PRs (as of session end)

- **#20** — `feat(ui): bottle interval guard` — confirms before logging a new bottle if last bottle was within `minBottleIntervalMinutes` (default 20). Prevents the "mash 12 times in 10s" incident.

## Active work — Timeline polish v2 (PR #33, in flight)

**Branch:** `feat/timeline-polish-v2` · **PR:** [#33](https://github.com/JakemoCode/baby-day-planner/pull/33) · **Status:** open, accepting more polish per Jake until he calls it done. **342 tests passing**, lint + typecheck clean.

### What's landed on PR #33 so far
- Hour tick line clipped behind label (not through text)
- ≤3 free-standing on-hour events collapse to one row (single dot, no per-event time)
- Putdown emits `endTime` from engine → renders as its own short DurationBlock between wake window and nap (with single-row label · range layout)
- "Putdown · X" abbreviation in both chip and block contexts
- Manual bedtime overrides flow through `applyBedtime` (engine consumes actuals)
- Manual wake-window overrides flow through new `applyWakeWindowOverrides` (engine step before `applyTemplate`)
- Owner badge moved inline with block label ("Wake Window 2 · Kelly"), not in the secondary range row
- Tighter single-line title in blocks; range as small subtitle that chips may overlap
- BLOCK_HEADER_PX 56 → 30 (chips sit close to actual time)
- "Edited" ✎ icon dropped from blocks and markers (was firing on owner-only edits)
- On-hour markers/chips drop their inline time (hour tick announces it)
- Editing a projected event creates a fresh manual doc with new id (was throwing NOT_FOUND on Firestore)
- Tomorrow's preview is tap-to-pick-owner: tap a nap/wake-window/bottle → `TemplateOwnerPicker` opens, picks owner, persists to selected template; tap an extra → existing edit drawer
- Shared `setOwnerInTemplate` helper at `src/components/DayTemplates/setOwnerInTemplate.ts` (used by `/day-templates` and `/tomorrow`)

### Known open issues (Jake's screenshots, awaiting next iteration)
- **Wake-window owner not always visible after edit** — engine step now merges manual overrides, should be working but verify after restart.
- **Chip-on-block-name overlap on edited blocks** — bumped `BLOCK_HEADER_PX` to 30. May still happen on blocks edited to start times that put a chip right at the title row. Check post-restart.
- **Image paste in iTerm sometimes pastes path string instead of image data** — client-side issue, not project. Workaround: drag-drop file into chat or use cmd+ctrl+shift+4.

### Resume here
1. `git checkout feat/timeline-polish-v2 && git pull`
2. Restart the dev server
3. Send next screenshot; iterate on the same branch + same PR
4. Merge PR #33 only when Jake says it's done

## Backlog (after PR #33 merges)

| # | Item | Notes |
|---|---|---|
| 1 | **Settings duration inputs as HH:MM** | Wake windows / bottle interval / nap length / putdown lead / dream-feed offsets currently take raw minutes. Build a reusable DurationInput (h:mm) and apply across editors. Persist as minutes — no schema change. |
| 2 | **Engine sanity dedup with badge** | Per Jake: option (b) — render duplicates with a small "duplicate" badge so user can tap each and delete. Naps are already protected by NapActionButton; bottles are protected by interval guard. |
| 3 | **🔥 Palette refresh + button tinting** (Jake has flagged twice — bumped) | `--color-surface: #ffffff` is too stark against warm cream `--color-bg`. NapActionButton renders pure white. Most owner-tint colors only appear as small dots. UI dominated by sage + white; user wants more soft earth-tones throughout. |
| 4 | **Settings accordion** (visual polish, deferred) | Sections collapsible. |
| 5 | **Wave 9** — PWA + E2E + design audit | Original Plan C roadmap final wave. |

## Decisions locked (do not re-ask)

- **Auth**: Google sign-in via Firebase, email allowlist (`jake136@yahoo.com`, `kellyrbarber@gmail.com`). Sticky persistence — sign in once per device, ~forever.
- **Theme**: Earth-tone palette (sage / terracotta / warm cream / dusty blue / coral). **Light mode only** — dark mode disabled in tokens.css (re-enable by uncommenting the `@media (prefers-color-scheme: dark)` block).
- **Time format**: 12-hour AM/PM throughout (`9:35 AM`), engine internal is "HH:MM" 24-hour.
- **Touch targets**: spacious (≥44pt), silent UI on actions, error-only toasts.
- **Editing**: tap an event on `/timeline` to open EventEditDrawer. Read-only view on `/history/[date]` with explicit edit affordance per event.
- **Day Templates** (PR E shape): day-picker (Sat/Sun), timeline rendering, **inline owner picker** beneath tapped event (3 buttons). Bottle slots derived from settings.
- **FAB type picker** (PR B shape): bottom-sheet, includes Custom (== extra), past-times today only.
- **Engine dedup**: option (b) — show duplicates with badge, don't silently hide. Pair with preventative UX.
- **Branch protection**: `main` requires PR + passing CI on `JakemoCode/baby-day-planner`. Direct pushes blocked.

## Known runtime gotchas (don't re-litigate)

1. **`process.env.NEXT_PUBLIC_*` direct property access only** — Next.js inlines at compile time. `process.env[name]` ships unchanged and reads as undefined in browser. Documented in `src/lib/firebase/client.ts` header.
2. **No Proxy on Firestore handles** — SDK does `instanceof` checks on the handle internally; Proxy fails them. Documented in `client.ts` header.
3. **Each Firebase service connects its own emulator at init time** — global "connect both" guard was a bug because AuthProvider mounts before Firestore is touched.
4. **`exactOptionalPropertyTypes: true`** — never assign `undefined` to an optional field; omit the key (`{ ... }` not `{ key: undefined }`). Use destructure-omit (`const { key: _omit, ...rest } = obj`).
5. **React 19 lint rules**:
   - `react-hooks/set-state-in-effect` — don't sync prop → state in `useEffect`. Use `key` prop pattern or derive directly.
   - `react-hooks/purity` — no `Date.now()` etc. in render. Use lazy `useState(() => Date.now())` or compute in handlers.
6. **`vitest.setup.ts`** sets default Firebase env vars so module-load doesn't crash in unit tests.
7. **Pre-push hook** runs emulator-backed integration tests. Reuses any emulator already on `:8080`; otherwise boots one via `firebase emulators:exec`.
8. **`useEvents` skips subscription when `dayId` is empty** — placeholder strings like `"__no_day__"` were rejected by Firestore as reserved.

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

→ http://localhost:3000 → sign in as `jake136@yahoo.com` (emulator popup) → tap **Settings** in kebab to populate first-run defaults if no Settings doc → tap **Start New Day** on dashboard to create today's Day record → app fully usable.

## Resuming with Claude

```
/session-start
```

The skill reads UI_REQUIREMENTS.md + COMPONENT_INVENTORY.md + this file. Most likely next action: **start PR E (Day Templates)** unless Jake redirects.

## Test counts (as of session end)

- Unit/mocked: **296 tests** across 60 files (`pnpm test`, runs in CI)
- Emulator integration: **17 tests** (`pnpm test:integration`, runs in pre-push hook)

## Project conventions reminder (already in CLAUDE.md / plugin standards)

- `.toBeInTheDocument()` is **banned**. Prefer `.toBeVisible()` or behavior assertions. Codified in `frontend-orchestration` plugin's `standards/testing.md`.
- CSS Modules + `tokens.css` only — no inline styles, no runtime CSS-in-JS.
- E2E tests are immutable; fix the component, never the test.
- Per-component branch + PR; never commit directly to main.
