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

## Active backlog (in priority order)

| # | Item | Notes |
|---|---|---|
| 1 | **Settings duration inputs as HH:MM** | Wake windows / bottle interval / nap length / putdown lead / dream-feed offsets currently take raw minutes. Build a reusable DurationInput (h:mm) and apply across editors. Persist as minutes — no schema change. |
| 2 | **Visual stacking in TimelineList** | Overlapping point markers stack at identical y-coordinates. DurationBlock label position fix landed; point-marker fan-out still pending. |
| 3 | **Engine sanity dedup with badge** | Per Jake: option (b) — render duplicates with a small "duplicate" badge so user can tap each and delete. Naps are already protected by NapActionButton; bottles are protected by interval guard. |
| 4 | **🔥 Palette refresh + button tinting** (Jake has flagged twice — bumped) | `--color-surface: #ffffff` is too stark against warm cream `--color-bg`. NapActionButton renders pure white. Most owner-tint colors only appear as small dots. UI dominated by sage + white; user wants more soft earth-tones throughout. |
| 5 | **Settings accordion** (visual polish, deferred) | Sections collapsible. |
| 6 | **Wave 9** — PWA + E2E + design audit | Original Plan C roadmap final wave. |

PRs E (#22), B (#23), bottle/nap subtext (#24), and end-of-day messaging + timeline label fix all merged.

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
