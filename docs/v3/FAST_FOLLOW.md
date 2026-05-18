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

**Status**: split into F2a + F2b (2026-05-18 after Variant A pick
in palette-explore mockup).

**§F2a — Dashboard surface contrast lift + sage side-band**: `in-progress`
(this PR). One token + two component changes:
- `--color-bg` from `#fbf8f3` to deeper cream `#f2ebde` (cards stay
  pure white; raised stays `#fefcf7` for timeline-block warmth)
- `NextBottlePanel` + `NextSleepPanel` get a 4px sage side-band on
  the left (`border-left: 4px solid var(--color-accent-soft)`) per
  Variant A of the palette-explore mockup

Bg→surface contrast goes from 1.06 → 1.19. Spec asked for ≥1.4 but
matching that requires a noticeably darker oat bg (`#e3d7be`) which
Jake vetoed as too sandy — the wedding palette is intentionally
close-tone.

**§F2b — Timeline palette pass**: `pending`. After F2a ships, build
a timeline-focused HTML mockup (3 chip-treatment variants exploring
owner stripe vs event fill emphasis + density) for Jake to react to
before touching real timeline CSS.

**Why fast-follow, not pre-V3**: ARCHITECTURE_V3 §6.4 differential
testing checks engine *output* (event arrays), not rendered pixels.
Palette can shift independently.

**Acceptance**:
- ✅ Surface visibly lifts off bg (1.06 → 1.19 in F2a; original ≥1.4
  target relaxed — see F2a entry for the wedding-palette reason).
- Owner stripes readable as colored bands at chip-thumbnail size (F2b).
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

**Pixel-level alignment punchlist (deferred from PR #108 audit)**:
- Jake's owner pill is ~5-blue warmer than V2 (cream-toned `--color-bg`
  bleeds through the 20% mix). Math in `docs/_archive/v3/V2_CSS_DRIFT_AUDIT.md`.
  Possible fixes: bump mix to 25%, use `--color-surface` instead of
  `--color-bg`, or revert to per-owner pre-mixed `--owner-color-tint`
  tokens (loses owner-agnostic affordance).
- `CurrentWakeWindowStatus.dot` is hardcoded `var(--color-accent)`; V2
  varied it per owner. Wire to `var(--owner-color, var(--color-accent))`
  if the per-owner indicator is desired.

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

## §F8 — Dashboard UX polish pass

**Source**: Jake, 2026-05-10 click-test feedback.

**Status**: `pending`

**What** (collected items — split into sub-PRs as appropriate):

- **Day total ounces**: surface "X.X oz today" on the dashboard
- **Last bottle consolidation**: replace `"logged X oz Bottle N / last: HH:MMa X oz"` with a single line `"last bottle: HH:MMa X oz"` and tap-to-edit
- **Start Bottle button needs owner**: the current "Start" action commits without prompting for owner — add inline owner pick or default to last-used
- **Edit nap start time from dashboard**: naps usually get "Started" 5+ min after actual start (busy putting baby down). Need an easy retro-edit affordance on the dashboard, not just in the drawer
- **"In wake window" banner — show "asleep?"**: clarify state when baby's already napping but the WW projection is still active
- ~~**"Start bedtime" CTA after bedtime threshold**: dashboard should switch primary action to bedtime once `nowMinutes ≥ settings.bedtimeThreshold`~~ — **delivered** in the physiology cascade campaign (PR for `feat/v3-physiology-cascade`).
- **Button hierarchy**: Primary = start next event, Secondary = edit last event, Tertiary = skip event

**Why fast-follow**: UX polish on a working dashboard; engine-orthogonal.

**Estimated effort**: split into 3-5 small PRs. ~1-2 days total.

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

## §F11 — Settings: explicit Save button + success feedback

**Source**: Jake, 2026-05-10.

**Status**: `pending`

**What**: today the Settings page autosaves on every field change. Two problems:
1. **No user-visible confirmation** — users have no signal that their edits actually persisted; trust comes from "I think it worked"
2. **Unnecessary recalculations during edit** — every keystroke / field tweak retriggers projection, owner-list rebuilds, etc. while the user is mid-thought

Replace with: explicit **Save** button at section or page level + a transient success indicator ("Settings successfully saved" toast / inline confirmation that fades after ~3s). While the form is dirty, projection consumers continue rendering against the last-saved settings — only the save commits.

**Why fast-follow**: pure UX/state-management change; engine-orthogonal. Touches Settings page + the hooks that publish settings to the rest of the app.

**Open design questions** (decide during implementation):
- Per-section save buttons (matches the planned §F1 accordion UX) vs page-level single Save?
- Dirty-form guard on navigation away?
- Optimistic vs pessimistic save (Firestore latency)?

**Acceptance**:
- Editing a field doesn't trigger projection recalc until Save
- Save button disabled when no changes
- Visible success state on commit (toast or inline, accessibility-wired with role="status")
- Discard / reset path for in-progress edits

---

## §F12 — Confirm Tomorrow plan + auto-promote on Start Day

**Source**: Jake, 2026-05-10 (during PR-B3 review).

**Status**: `pending`

**What**: today, promoting Tomorrow is a manual action that the user must remember to take when they wake. Add a "Confirm tomorrow plan" affordance on the Tomorrow page (Save / Confirm button) that captures the planned wakeTime / templateId / extras into a persisted "tomorrow plan" doc. Then on the Dashboard's "Start Day" action, if a confirmed tomorrow plan exists for today's date, auto-promote it instead of starting empty.

**Why fast-follow**: PR-B3 already persists extras on promote (data correctness). This is the next-level UX — relieves the user of remembering to promote, gives confidence the night-before planning isn't wasted.

**Open design questions**:
- Schema: new `/children/{id}/tomorrowPlan/{date}` doc, or extend `Day` shape with a `planned` status?
- Confirm vs save — one-tap commit or preview-then-lock?
- Edits after confirmation: re-confirm, or auto-update?
- If user manually taps Start Day with a confirmed plan present, prompt or apply silently?

---

## §F13 — TemplateOwnerPicker should own its own chrome (onCancel + section header)

**Source**: code-simplifier review of PR-B5, 2026-05-10.

**Status**: `pending`

**What**: V3 `TemplateOwnerPicker` (in `src/v3/components/DayTemplates/`) has no `onCancel` prop. PR-B5 had to recreate sticky-card chrome around it: `.pickerWrap`, `.pickerHeader`, `.pickerLabel`, `.pickerCancel` plus header markup like `Owner for {selectedEvent.label}`. Any other consumer would have to duplicate this.

**Fix**: add `onCancel?: () => void` and an optional title slot/label prop to `TemplateOwnerPicker`. The DayTemplates page can then drop the four `.picker*` CSS classes plus the wrapper div.

**Why fast-follow**: small focused refactor; one component + one consumer. PR-B5 already shipped with the workaround so no rush, but the longer it sits the more callers might copy it.

---

## §F14 — Settings defaults audit + Settings UX pass

**Source**: Jake click-test feedback, 2026-05-11.

**Status**: `pending`

### Numeric defaults (current → proposed)
- `defaultNapLengthMinutes`: 90 → **45** (one sleep cycle covers most newborns/infants)
- `bedtimeThreshold`: 19:00 → **17:30** (1050 TimeMin)
- `shortNapThresholdMinutes`: 45 → **30**
- `shortNapAdjustmentMinutes`: 30 → **10**
- `napDurationMin`: 30 → **20**
- `defaultBottleIntervalMinutes`: 180 → **150**
- `wakeWindowsMinutes`: `[120, 150, 180, 180, 180, 180]` → **TBD**. Current values aren't grounded in the PRD. Wake-window length is baby-age-dependent; suggest parameterizing via §F10 onboarding (age-based suggestions). Until then, replace with shorter newborn-friendly values, or annotate `// FIXME(§F10)`.

### Settings UI labels + helper text
- `shortNapThresholdMinutes` — add helper text explaining the rule
- `shortNapAdjustmentMinutes` — add helper text
- `bottleChain.bufferAfterWakeMinutes` — rename label to **"default time from wake to first bottle"**
- Duration fields render as raw minutes; should display as HH:MM (overlaps §F6)

### Missing dailyRecurring / extras editor
Jake noted "I don't see extra recurring events in settings? where'd that go?" — `Settings.dailyRecurring[]` exists in the schema but the V3 Settings page doesn't expose it. Investigate; restore the editor (or add to §F1 accordion when it lands).

---

## §F15 — Migrate duplicating test fixture files to `aSettings()` factory

**Source**: code-simplifier review of PR #111, 2026-05-11.

**Status**: `pending`

**What**: six test files duplicate full `Settings` literals instead of calling the existing `aSettings(overrides)` factory in `src/v3/__tests__/factories.ts`. Every schema field addition makes all six fail to compile and requires a synchronized edit (PR #111 used `re.sub` — that ritual is the smell).

Files to migrate:
- `src/app/(authed)/page.test.tsx`
- `src/app/(authed)/day-templates/page.test.tsx`
- `src/app/(authed)/tomorrow/page.test.tsx`
- `src/v3/components/Tomorrow/TomorrowPreview.test.tsx`
- `src/v3/components/shared/createEventTemplate.test.ts`
- `src/v3/repositories/settings.test.ts`

Each ~20-line literal collapses to 3-5 lines using `aSettings({ /* overrides */ })`. After this, schema additions only touch the factory.

**Estimated effort**: 30 minutes, one PR, mechanical.

---

## §F16 — Settings page row helpers should use CSS Modules

**Source**: code-reviewer of PR #111, 2026-05-11.

**Status**: `pending`

**What**: every row helper in `src/app/(authed)/settings/page.tsx` (`Section`, `TimeRow`, `NumberRow`, `WakeWindowsRow`, `PumpTimesRow`, `OwnerSlotRow`, `ColorModeRow`, `CheckboxRow`) uses inline `style={{ ... }}` for layout, font size, and colors. Project standard (`CLAUDE.md`) is CSS Modules + tokens only — no runtime CSS-in-JS.

The whole file violates the standard, not just the two new helpers added in PR #111. PR #111 matched the existing convention rather than departing from it for two rows — the proper fix is to migrate the whole file in one pass.

**Estimated effort**: 1-2 hours. Move all row layout into `page.module.css` with proper class names.

---

## §F17 — Deprecate "Start Day" button; auto-anchor day at `defaultWakeTime`

**Source**: Jake, 2026-05-11 — extending §F12. The deeper architectural take behind "fixing the day starting at 2:30pm or 7pm or whenever Start Day is pressed."

**Status**: `pending`

**What**: today, a Day doc only gains a `wakeTime` (and starts rendering as "active") when the user taps **Start Day** on the Dashboard. The button has been a source of two distinct bugs:
1. **Wall-clock anchoring** (fixed in PR #107): `wakeTime` used to be the click time. If Jake forgot to tap until 2:30 PM, the timeline rotated to start at 2:30 PM. Now uses `settings.defaultWakeTime`.
2. **Forgetting to tap at all**: the button is a manual ritual on top of a fact the system already knows (today's date + `defaultWakeTime`). It exists only because the data model conflates "day exists" with "day has been confirmed by a human."

**Architectural fix**: the Day should auto-anchor at `defaultWakeTime` the moment the calendar date flips. No button required. The "started" affordance moves to *Bedtime end* (which already exists and is the actual semantic boundary). Combined with §F12, the user's only morning interaction is recording the first bottle / wake-up — no ceremonial taps.

**Why fast-follow, not pre-V3**: the engine doesn't care — `wakeTime` is just a `TimeMin` on the Day doc. This is a UX + day-creation-lifecycle change, not a rules change.

**Open design questions**:
- Where does day creation happen? Client-side on first load of the new date, or a cron / scheduled job?
- What if the user wakes earlier than `defaultWakeTime`? Recording the first bottle / "End bedtime" event should retroactively update `wakeTime` (or the engine should treat `defaultWakeTime` as a fallback when no real wake event has been recorded yet).
- Backwards compat with the "planned" / "active" status field on `Day` — does "active" still mean anything if days auto-anchor?
- Combine with §F12: if a confirmed tomorrow plan exists, apply it on date-flip; otherwise auto-create with `defaultWakeTime` and an empty template.

**Acceptance**:
- "Start Day" button removed from the Dashboard.
- Opening the app on a new calendar date shows today's timeline anchored at `defaultWakeTime` with zero taps.
- Recording the first event of the day Just Works without any "you need to start the day first" gating.
- Click-time NEVER influences `Day.wakeTime`.

---

## §F18 — Retroactive edit of the day's wake time

**Source**: Jake, 2026-05-12 click-test.

**Status**: `pending`

**What**: there's currently no UI to change `Day.wakeTime` once the day exists. If the user discovers they need to correct the wake time (e.g. baby actually woke at 6:45 not 7:00), the cascade is stuck. Add an editable wake-time control on the timeline or dashboard, probably on the wake event itself (or wherever the day's start is visually rooted).

**Why fast-follow**: data correctness affordance; engine already supports any `wakeTime` value, just missing the UI write path.

**Related**: §F17 (auto-anchor at `defaultWakeTime`) — once §F17 lands, this edit affordance is still needed for cases where the actual wake-up diverges from the default.

---

## §F19 — Bottle owner picker: support "other" owners (named extras)

**Source**: Jake, 2026-05-12 click-test.

**Status**: `pending`

**What**: bottle owner picker should let the user select an `other:<id>` owner (Grandma, Daycare, Babysitter, etc.) — not just `parent1` / `parent2`. The schema (`OwnersConfig.other: Array<{id, displayName, color}>`) already supports this; the picker just needs to render the configured `other[]` entries alongside the parents, with affordance to add a new named owner inline.

**Why fast-follow**: engine + schema already there; pure UI gap. Affects bottle assignment realism for families using daycare or alloparents.

---

## §F23 — Edit drawer title should include event number when present

**Source**: Jake, 2026-05-13 click-test.

**Status**: `pending`

**What**: today the drawer title is "Edit bottle" / "Edit nap" / etc. Should include the event's number when applicable: "Edit Bottle 3", "Edit Nap 2". The number comes from the existing `Bottle N` / `Nap N` label that R5.4 chronological renumbering produces.

Mechanics: in `EventEditDrawerV3.tsx`, the `EDIT_TITLE_BY_TYPE` constant is a flat map of `type → string`. Replace with logic that derives the title from `event.label` (which already has the number for bottles/naps) or builds it from `type + extracted number from eventKey`.

**Why fast-follow**: tiny UI change, engine-orthogonal. Couple-line patch.

---

## §F27 — Delete button on Extra event drawer

**Source**: Jake, 2026-05-14 click-test of PR #139.

**Status**: `pending`

**What**: an extra (custom) event in the drawer has no delete button, so the only way to remove a one-off mistake is to wipe the day. The drawer's `canDelete` gate is `mode === "edit" && onDelete && isRecorded(lifecycle)` — for extras this should be true after a save (lifecycle becomes `completed`), but the drawer's parent may not be wiring `onDelete` for the extras path.

Mechanics: audit `EventEditDrawerV3.tsx` + the dashboard / tomorrow / timeline page handlers — confirm `onDelete` is passed for extras, and that the drawer's red "Delete" button appears for both kind=instant and kind=block extras.

**Why fast-follow**: small UI/wiring fix, no engine impact. Quality-of-life — without it, extras are write-only.

---

## §F28 — Multi-chip collapse for near-simultaneous instant events

**Source**: Jake, 2026-05-14 click-test of PR #139. Edge case caused by stacked custom events at 4:03p / 4:20p / 4:20p visibly overlapping in the chip column.

**Status**: `pending`

**What**: collapse instant chips that crowd the same vertical space on the timeline into a single "multi chip" so they don't overlap.

Rules:

| Scenario | Rendering |
|---|---|
| 1 event | Normal `InstantChip` (current behavior) |
| 2–3 events at the exact same start time | `InstantCluster` with shared timestamp (current behavior) |
| Any event(s) whose start times differ by `0 < diff < 5 min` from another event | **Multi chip**: `<first event's name> +<N> more`, NO timestamp |
| 4+ events at the same start time | **Multi chip**, same shape |
| An `InstantCluster` + any event within 5 min of it | **Multi chip** absorbing the cluster |

Multi chip tap target: opens a drawer listing each contained event with name + time, each row tappable to route into that event's normal edit drawer.

Mechanics: extend `src/v3/components/Timeline/groupInstants.ts` to bucket within a 5-min sliding window (not exact equality), and add a `MultiChip` component + drawer. `InstantCluster` stays for the 2–3-at-same-time path; threshold logic lives in groupInstants.

**Why fast-follow**: rare edge case (multiple custom events in a narrow window) but produces a visually broken stack when it happens. Not engine-shaped.

---

## §F29 — Color audit: terracotta-on-sage contrast

**Source**: Jake, 2026-05-14 click-test of PR #141.

**Status**: `pending`

**What**: Kelly's owner color (`--color-owner-kelly: #ce8e7e`, terracotta/coral) renders as text on top of sage-tinted nap and bedtime blocks (`--color-accent-soft: #b5c8b3`). Resulting contrast is low and the owner name is hard to read.

Mechanics: in the timeline's `[data-color-mode="type"]` mode, the block background comes from `--color-accent-soft` (sage) for nap/bedtime, and the owner text inside the block picks up `--owner-color` directly (raw saturated hue). The combo doesn't meet WCAG AA for small text.

Likely fix: introduce a "text on tinted block" variant of each owner color — darker, higher-contrast — or compute it with `color-mix` against a target lightness. Same logic the dashboard's `--color-owner-kelly-tint` follows in reverse (light background tint exists; need a dark-text tint).

Worth a full color audit pass while we're at it: every owner-text-on-block pairing, plus pump-tint × owner text, plus daycare-gray × text.

**Why fast-follow**: a11y / legibility — not blocking but should land before any wider rollout.

---

## §F30 — Instant chip vertical alignment

**Source**: Jake, 2026-05-16 dogfooding.

**Status**: `pending`

**What**: instant chips (e.g. "Bottle 3 · 1p") sit vertically below their TimeMin tic line. Visible regression: a 1pm bottle's chip is offset BELOW the 1P axis tic, while adjacent block events (e.g. "Putdown · 1p") align correctly with the 1P line.

Likely cause: `InstantChip` (or its positioning wrapper in `TimelineV3.tsx`) uses the chip's TOP edge for the y-coordinate instead of vertical-center relative to the time axis. Block events use top-edge by design (a 60-min block starts at its startTime, runs downward); chips should use center-vertical because a chip has no duration and its visual anchor is the timestamp.

**Why fast-follow**: cosmetic — engine output is correct, render layer mis-positions one element type. One-file fix in the chip positioning calc.

---

## §F31 — Responsive timeline (drop magic-number widths)

**Source**: Jake, 2026-05-16.

**Status**: `pending`

**What**: TimelineV3 uses fixed-pixel constants (`AXIS_W = 28`, `GUTTER_W = 124`, `BLOCK_LEFT_INSET = AXIS_W + 8`, `BLOCK_RIGHT_INSET = GUTTER_W + 24`, etc.) that don't adapt to viewport width. Two related concerns:

1. **Responsive layout** — switch to percentages or `calc()` so the block/chip column proportions scale with available width. Current fixed-px layout looks fine on a phone-width viewport and bloated on desktop (or vice versa).
2. **Narrow-screen break** — below a screen-width threshold (TBD; ~360px?), instant chips should break their label to two lines (`Bottle 3` / `1p · Jake`) instead of cramming horizontally. Avoids overflow / truncation on small phones.

**Why fast-follow**: cosmetic UX polish; engine-orthogonal. Sits in `TimelineV3.module.css` + chip components. Worth doing alongside or after §F2 palette refresh and §F29 contrast audit so the visual sweep lands together.

---

## §F33 — User-selectable color themes

**Source**: Jake, 2026-05-18 (during F2 palette explore).

**Status**: `pending`

**What**: let the user pick from several themed palettes in Settings.
`tokens.css` already supports manual override via `[data-theme="dark"]`
on `<html>`; extend that mechanism to named light themes (e.g.
"Sage" (current), "Coastal" (blue-leaning), "Sunset" (rust-leaning),
plus the existing dark mode).

**Why fast-follow**: pure UI/UX; no engine impact. Worth waiting until
the F2 palette work settles so the "default" theme is stable before
adding alternatives.

**Estimated effort**: 2–3 days. ~3 hand-tuned palettes + a Settings
picker + localStorage persistence (mirror existing accordion
remembered-section pattern).

---

## §F34 — Expose explicit hue tokens beside semantic ones

**Source**: Jake, 2026-05-18 (during F2 palette explore).

**Status**: `pending`

**What**: today the wedding-mood hues live behind semantic names —
`--color-warning` is the terracotta/rust, `--color-owner-jake` is
the dusty blue. Per-event-type styling (potentially landing in §F2b)
benefits from named hue tokens like `--color-rust`, `--color-blue`,
`--color-sage`, `--color-purple` that components can reference directly
without overloading the semantic tokens.

Add hue tokens as the source of truth; redefine the existing semantic
tokens in terms of them so nothing changes visually:

```css
--color-rust:   #bc5b2e;
--color-blue:   #649ec3;
--color-sage:   #7d9a7a;
--color-purple: #9b7bb3;
--color-warning: var(--color-rust);    /* alias */
--color-accent:  var(--color-sage);    /* alias */
```

**Why fast-follow**: enables §F2b (timeline event-type fills) without
forcing per-event styles to import the awkward semantic names. Doesn't
need to ship before F2b — could be folded into the same PR.

## §F35 — Named multi-template support

**Source**: Jake, 2026-05-18 (exploring after F13 picker polish landed).

**Status**: `pending`

**What**: today the day-templates page hardcodes two tabs — Saturday and Sunday — but `OwnershipTemplate` already carries `id` + `displayName` ("Saturday, Half-day Friday, Travel, etc." per the schema comment) and the repository / hook (`useV3Templates`) already model an unbounded list. Open up CRUD on the page (add / rename / delete templates) and let the user assign a template to a specific date.

**Why fast-follow, not now**: Sat/Sun + Tomorrow is enough to plan the immediate week. Real demand for "Travel day", "Half-day Friday", etc. is theoretical until a non-default Wednesday shows up.

**Plumbing already in place** (no engine / persistence changes needed):
- `OwnershipTemplate.id` + `displayName` (schemas.ts).
- `useV3Templates` returns a list; repo writes individually by id.
- `setOwnerInTemplate` is template-agnostic.
- The post-F13 picker chrome (BottomSheet) is name-agnostic — already shows `template.displayName` indirectly via the `title` prop the consumer constructs.

**Design question to settle first — how does a user *assign* a custom template to a future date?** Three plausible patterns:

| Pattern | Pros | Cons |
|---|---|---|
| **A — Manual every day** Tomorrow page exposes a template dropdown. | Simplest mental model. | Repetitive when most days are weekday-default. |
| **B — Weekday defaults + per-date override** *(recommended)* Settings hold `{mon: 'weekday', sat: 'saturday', ...}`; Tomorrow page lets the user override for the specific date. | Keeps the current auto-pick working for the common case. One-shot override is a single tap. | New shape on Settings + lightweight persistence for the override. |
| **C — Calendar / exceptions list** Settings hold `[{date: '2026-06-05', templateId: 'travel'}, ...]`. | Plan a week in advance. | Highest implementation cost; UX needs a date picker. |

**Recommended**: **B**. Smallest delta from today's flow; the weekday auto-pick already works for ~6 days a week.

**Scope** (assuming B, ~1 day):

| Block | Work |
|---|---|
| Template CRUD UI | Add `+ New template` button on `/day-templates`; rename via clicking the tab title; delete via per-tab kebab. Persist to existing repo. |
| Dynamic tabs | Replace hardcoded Sat/Sun JSX with `templates.map(...)`; selected tab persists to localStorage like the settings accordion (reuse `useLocalStorageString`). |
| Tomorrow page override | Add a "Use template" dropdown above the timeline; default selection = weekday auto-pick; manual selection persists to the tomorrow-plan doc (already exists per §F12). |
| Weekday → template defaults | New `Settings.weekdayTemplates` field: `Record<Weekday, templateId>`. Defaulter fills in `sat: 'saturday', sun: 'sunday', mon-fri: 'weekday'` (or `null` if no weekday template). |
| Tests | RTL: template creation + rename + delete; tomorrow page override → persisted; weekday default + override unit test. |

**Acceptance**:
- User can create a named template, rename it, and delete it from the day-templates page.
- All templates appear as tabs; switching tabs persists selection across navigations.
- Tomorrow page surfaces a template selector; default matches the weekday config; user override wins for that date.
- Existing Sat/Sun tabs continue to work (migration: `withV3SettingsDefaults` seeds the weekday defaults map on first read).

**Out of scope**:
- Calendar / multi-date assignment (pattern C). Defer until the override flow proves repetitive.
- Sharing templates across children / accounts.

---

---

## §F35 — Owner cannot be unassigned from blocks or instant chips

**Source**: Jake, 2026-05-18 (click-test of §F2b timeline).

**Status**: `pending`

**What**: the owner picker / event drawer has no "None" or "Unassign"
affordance, so once an event has an owner assigned there's no way to
revert it to unowned through the UI. Confirmed for blocks (naps,
bedtime, pump, duration extras) and instant chips (bottles, instant
extras, daycare).

Likely fix is in the owner-picker shared component used by the edit
drawer — add an explicit "None" option that writes `owner: undefined`
(or whatever the schema's "no owner" representation is) when picked.
Repo-write path also needs to handle clearing the field cleanly
(Firestore needs `deleteField()` or equivalent, not `undefined`).

**Why fast-follow**: small UI surface, but writes through the same
event update path as everything else, so worth its own PR with a
seam test (per `feedback_seam_coverage_required.md` memory) that
walks tap-None → save → re-read → owner gone from projected event.

**Estimated effort**: 1 day (component + write-path + seam test).

---

## §F36 — Smarter chip-label truncation (avoid ellipsis-makes-it-worse)

**Source**: Jake, 2026-05-18 (click-test of §F2b timeline).

**Status**: `pending`

**What**: when a long chip label JUST barely overflows the chip's
max-width, `text-overflow: ellipsis` triggers and the "..." takes more
horizontal space than the chars it replaced. Net: a label like
"Event Name 123" displays as "Event Name 12..." even though the
truncation-free version would have fit naturally.

Standard CSS behavior; fix requires JS measurement. Approach: after
layout, if label is ellipsed, compute (scrollWidth - clientWidth). If
under some threshold (e.g. 20px), suppress ellipsis and either let
the label overflow visually (clip with no ellipsis) or use a
slightly smaller font to fit.

**Why fast-follow**: cosmetic; CSS-standard behavior. Not blocking.

**Estimated effort**: 0.5 day (per-chip ResizeObserver already in
InstantChip for the wrap detection — extend the same effect to also
measure and toggle a `data-near-fit` attribute).

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
