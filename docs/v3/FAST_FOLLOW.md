# V3 Fast-Follow Backlog

> Items deferred to land **soon after** the V3 engine rebuild ships
> (i.e., after Phase 4 — V3 default flip + V2 cleanup). Not blocking
> Phase 1; not bundled with V3 PRs.

> Each item should be a small, self-contained PR that doesn't touch
> the rules engine. The fast-follow window is the time between V3
> stable and Wave 9 (PWA + E2E + design audit).

---

## Status legend

- `pending` — not yet started
- `in-progress` — actively being worked on
- `done` — landed; remove from this list

---

## §F1 — Settings page collapsible accordion

**Source**: OUT_OF_SCOPE §11 (V2 backlog item).

**Status**: `pending`

**What**: convert the Settings page sections (Times, Bottle, Naps,
Owners, Daycare, Members, …) into a collapsible accordion. Only one
section open at a time; remembered selection persists per-device
(localStorage).

**Why fast-follow, not in V3**: pure UI; engine-orthogonal. Doesn't
need any V3 plumbing.

**Estimated effort**: 1 day. Single PR against `main` after V3 stable.

**Acceptance**:
- Each section header collapses/expands on tap.
- Open section persists across page navigations.
- Keyboard accessible (Tab to header, Enter/Space to toggle).
- No regression in the existing form behavior.

---

## §F2 — Palette refresh

**Source**: OUT_OF_SCOPE §12 (V2 backlog item, 🔥 flagged twice).

**Status**: `pending`

**What**: rework `src/styles/tokens.css` to address two longstanding
issues:
1. Too much white (cards/surfaces blend into background).
2. Owner tints (sage, terracotta, dusty blue, coral) too pale to
   reliably distinguish on small chips and stripe overlays.

**Why fast-follow, not pre-V3**: ARCHITECTURE_V3 §6.4 differential
testing checks engine *output* (event arrays), not rendered pixels.
Palette can shift independently. Doing it pre-V3 would burn the
"awaiting plan ratification" window we no longer have.

**Estimated effort**: 2–3 days. Includes a `/design-audit` pass at
the end to verify contrast and visual hierarchy on the existing V3
timeline.

**Acceptance**:
- Owner stripes readable as colored bands at chip-thumbnail size.
- Surface vs. background contrast ratio ≥ 1.4 (currently ~1.05).
- Existing tokens stay token-named (no inline colors anywhere).
- `/design-audit` run on `/timeline`, `/dashboard`, `/settings`
  reports zero new critical or major issues.

---

## §F3 — First-time user onboarding (dashboard)

**Source**: cutover dogfooding, 2026-05-09 — Jake noted the dashboard
isn't friendly to a first-time user with an empty Firestore.

**Status**: `pending`

**What**: when no settings doc exists yet, the dashboard should walk
the user through initial setup instead of crashing or showing an
empty/broken state. Minimum bar:
- Detect "no settings" / "no day" state and route to a setup flow
  rather than rendering a partial timeline / dashboard.
- Setup flow collects: parent display names, default wake time,
  bedtime threshold, default nap length, wake-window minutes.
- Daycare + dailyRecurring + dream feed deferred to a "later" panel
  inside the regular Settings page once basic setup is done.
- After setup: write a complete V3 settings doc and redirect to
  the dashboard with a "Start the day" CTA prominent.

**Why fast-follow, not pre-V3**: not blocking the cutover (current
users have data already). Becomes blocking the moment we want anyone
besides Jake to try the app.

**Estimated effort**: 1–2 days. Single PR after the cross-surface
cutover stabilizes.

**Acceptance**:
- Visiting any authed route with no settings doc redirects to
  `/welcome` (or wherever the setup flow lives).
- Setup flow fields validate before the user can proceed.
- After setup, settings doc satisfies the V3 schema with no
  fall-through to `withV3SettingsDefaults`.
- Existing users (with a complete settings doc) never see the
  flow.

---

## §F4 — Owner color picker as themes, not raw hex

**Source**: cutover dogfooding, 2026-05-09 — `OwnersConfigEditor`
(PR #64) currently exposes a free-text hex input for each owner's
color. Jake wants a curated palette instead.

**Status**: `pending`

**What**: replace the hex `<input type="text">` in
`OwnersConfigEditor` with a swatch picker constrained to a set
theme. The theme lives in `tokens.css` as named CSS variables
(`--owner-sage`, `--owner-terracotta`, `--owner-dusty-blue`,
`--owner-coral`, …); the picker shows them as labeled swatches
and writes the variable name (or its resolved value) onto
`OwnersConfig.{parent1,parent2,other[].color`.

Multiple themes possible later (light / dark / high-contrast)
without changing any owner data — only the variable resolves
differently per theme.

**Why fast-follow, not pre-V3**: pure UI. Doesn't change the
engine, the wire format on `OwnersConfig.color`, or any selector
contract. Pairs naturally with §F2 (palette refresh).

**Estimated effort**: 0.5 day. Single PR after §F2 lands so the
swatch set is the refreshed palette, not the legacy one.

**Acceptance**:
- No free-text hex input in `OwnersConfigEditor`.
- Swatches are accessible buttons (Tab to focus, Enter / Space
  to select; `aria-pressed` on the active one).
- The selected swatch's color value (or token name) is what
  Firestore stores — no hex anywhere in the form code.
- Existing owners with arbitrary stored hex values render
  correctly (closest-swatch fallback or sentinel "Custom" tile).

---

## §F5 — Wake windows: include "after wake-up" before nap 1

**Source**: cutover dogfooding, 2026-05-09 — V3 settings page
(PR #64) labels wake-window rows "After nap 1, After nap 2, …"
but the FIRST wake window of the day is the gap between
ending-bedtime (morning wake-up) and nap 1, not the gap after
any nap.

**Status**: `pending`

**What**: relabel + reframe so the editor shows:
- "After wake-up" (morning) → drives nap 1's start
- "After nap 1" → drives nap 2's start
- "After nap 2" → drives nap 3's start
- …

The data shape (`wakeWindowsMinutes: number[]`) doesn't need to
change — `wakeWindowsMinutes[0]` already corresponds to the gap
after wake, `[1]` to after nap 1, etc., per R3.x. Only the
labels need fixing. Verify the engine treats index 0 as
post-wake (R3.1 / R4.1) and adjust if not.

**Why fast-follow, not in PR #64**: cosmetic labeling fix; not
blocking dogfooding (the math works). Worth doing as a small
cleanup PR after the cutover stabilizes.

**Estimated effort**: 30 minutes. Likely just a text change in
`OwnersConfigEditor`'s sibling `WakeWindowsRow` helper.

**Acceptance**:
- First wake-window row labeled "After wake-up" (or similar).
- Subsequent rows labeled by the nap they follow.
- Engine output unchanged for the same input array (verify via
  R3 / R4 unit tests still passing).

---

## §F6 — Better time / duration input UX

**Source**: cutover dogfooding, 2026-05-09 — native HTML
`<input type="time">` is awkward on desktop: typing minutes
directly doesn't work, you have to use arrow keys or the
browser's time-picker popup.

**Status**: `pending`

**What**: replace native time inputs across the V3 settings
page (and EventEditDrawerV3) with a custom picker:
- Two-finger / two-thumb clock-face picker on touch
- Direct numeric typing on desktop ("0830" → 8:30 AM)
- Inline validation (out-of-range gets clamped or rejected)
- Same UX for absolute times (TimeMin) AND durations
  (where "02:30" means 2h 30m)

**Why fast-follow, not pre-V3**: native input works for the
engine's correctness — just not for ergonomics. Worth doing
once after dogfooding identifies how often time entry happens
in real use.

**Estimated effort**: 1–2 days. Single picker component lands
in `src/v3/components/shared/`, then call sites swap in.

**Acceptance**:
- No `<input type="time">` left in V3 component tree
  (timeline drawer, settings page, anywhere else).
- Picker handles both absolute time and duration semantics
  (consumers pass a mode prop).
- Touch and desktop UX both feel native.
- Direct keyboard typing works on desktop without touching
  the popup.

---

## §F7 — Delete the V2 ← V3 back-compat shim

**Source**: PR #66 — `src/v3/firestore/v2Backcompat.ts` was added
as a transitional shim so V2 surfaces (Dashboard, Tomorrow,
History, Day-templates, AppShell) keep reading the V3-shape
Firestore docs that PR #60 (timeline) and PR #64 (settings)
write.

**Status**: `pending` — blocked on the cross-surface cutover

**What**: when the last V2 surface is cut over to V3 hooks,
delete the shim and its consumers:
- Delete `src/v3/firestore/v2Backcompat.ts` + its test file
  (when added).
- Remove the `withV2SettingsBackcompat` call from
  `src/hooks/useSettings.ts`.
- Remove the `withV2EventBackcompat` call from
  `src/hooks/useEvents.ts`.
- Likely the V2 hooks themselves (`src/hooks/useSettings.ts`,
  `useEvents.ts`, `useDay.ts`, `useTemplates.ts`) delete at the
  same time, alongside `src/domain/`, `src/repositories/`, and
  V2 components.

**Why fast-follow, not now**: the shim is doing real work right
now (without it, every V2 page crashes on V3 docs). It deletes
naturally as part of the V2 cleanup once cross-surface cutover
finishes.

**Estimated effort**: 30 minutes once cross-surface cutover is
done. Mostly `rm` + import-cleanup.

**Acceptance**:
- No file in `src/v3/` imports anything from `@/domain` or
  `@/hooks/use{Day,Events,Settings,Templates}`.
- `grep -r "v2Backcompat" src/` returns empty.
- `pnpm typecheck && pnpm test && pnpm test:integration` all
  pass.

---

## §F8 — Dashboard UX polish pass

**Source**: Jake, 2026-05-10 click-test feedback.

**Status**: `pending`

**What** (collected items — split into sub-PRs as appropriate):

- **Day total ounces**: surface "X.X oz today" on the dashboard
- **Last bottle consolidation**: replace `"logged X oz Bottle N / last: HH:MMa X oz"` with a single line `"last bottle: HH:MMa X oz"` and tap-to-edit
- **Start Bottle button needs owner**: the current "Start" action commits without prompting for owner — add inline owner pick or default to last-used
- **Edit nap start time from dashboard**: naps usually get "Started" 5+ min after actual start (busy putting baby down). Need an easy retro-edit affordance on the dashboard, not just in the drawer
- **"In wake window" banner — show "asleep?"**: clarify state when baby's already napping but the WW projection is still active
- **"Start bedtime" CTA after bedtime threshold**: dashboard should switch primary action to bedtime once `nowMinutes ≥ settings.bedtimeThreshold`
- **Button hierarchy**: Primary = start next event, Secondary = edit last event, Tertiary = skip event

**Why fast-follow**: UX polish on a working dashboard; engine-orthogonal.

**Estimated effort**: split into 3-5 small PRs. ~1-2 days total.

---

## §F9 — Audit Timeline V2 test coverage

**Source**: Jake, 2026-05-10.

**Status**: `pending`

**What**: before V2 deletion in PR-C1, audit Timeline V2 test coverage so any V2-only behaviors that haven't been re-asserted in V3 are caught and either ported or explicitly waived. Goal: zero silent regressions through cutover.

**Why fast-follow**: must run BEFORE PR-C1 (the V2 wipe) — block the wipe on this audit.

---

## §F10 — Onboarding flow: child name + DOB (replace hardcoded `?? "aden"`)

**Source**: Jake, 2026-05-10.

**Status**: `pending`

**What**: today the app reads `process.env.NEXT_PUBLIC_DEFAULT_CHILD_ID ?? "aden"` in multiple places (AppShell, page routes, hooks) and `childName="Aden"` is wired in similarly. Build a real first-run onboarding flow that captures child name + DOB, persists to Firestore (e.g. `/children/{childId}` doc with `displayName` + `dateOfBirth`), and routes everything off that instead of the env var fallback.

**Why fast-follow, not in V3**: pure product/onboarding feature; engine-orthogonal. The hardcoded fallback is currently fine for the two-user (Jake/Kelly) deployment but blocks any broader use.

**Bonus**: enables this codebase to be useful to other new parents. Worth designing the model with multi-child / multi-family support in mind even if v1 ships single-child.

**Acceptance**:
- New users land on an onboarding screen if no `/children/*` doc exists
- `childId` derived from Firestore data, not env
- All `?? "aden"` / `childName="Aden"` references removed
- Existing data migration path documented (a one-shot script or just "type in Aden + DOB once")

---

## How items land here

Two paths:
1. **From OUT_OF_SCOPE**: an item flagged `fast-follow` during V3
   review.
2. **During V3 build**: a polish item discovered while building V3
   that's clearly not engine-shaped — flag here rather than
   side-tracking the engine PR.

When an item is done, delete it (or move to a `## Completed` section
at the bottom). Keep this doc short and actionable.

---

## Source References

- `OUT_OF_SCOPE.md` — items currently `fast-follow`-flagged.
- `REQUIREMENTS.md` — V3 engine requirements (read first if a
  fast-follow item turns out to need engine knowledge).
- `ARCHITECTURE_V3.md` — V3 architecture; relevant for understanding
  what NOT to break with a fast-follow PR.
