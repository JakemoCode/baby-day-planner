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
- **Button hierarchy**: Primary = start next event, Secondary = edit last event, Tertiary = skip event

**Why fast-follow**: UX polish on a working dashboard; engine-orthogonal.

**Estimated effort**: split into 3-5 small PRs. ~1-2 days total.

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

**What**: Kelly's owner color (`--color-owner-parent-2: #ce8e7e`, terracotta/coral) renders as text on top of sage-tinted nap and bedtime blocks (`--color-accent-soft: #b5c8b3`). Resulting contrast is low and the owner name is hard to read.

Mechanics: in the timeline's `[data-color-mode="type"]` mode, the block background comes from `--color-accent-soft` (sage) for nap/bedtime, and the owner text inside the block picks up `--owner-color` directly (raw saturated hue). The combo doesn't meet WCAG AA for small text.

Likely fix: introduce a "text on tinted block" variant of each owner color — darker, higher-contrast — or compute it with `color-mix` against a target lightness. Same logic the dashboard's `--color-owner-parent-2-tint` follows in reverse (light background tint exists; need a dark-text tint).

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
`--color-warning` is the terracotta/rust, `--color-owner-parent-1` is
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

## §F2c — §F2b chip phase-switch + BottomTab regressions

**Source**: Jake, 2026-05-18 (click-test after §F2b PR #178 merged).

**Status**: `pending` — needs verification (click-test on F37 dev
server did NOT show these regressions; may have been a stale-server
artifact from a parallel worktree).

**What**:
1. The chip's wrap-aware phase switching (label/time inline → label
   on top, time+owner below) regressed somewhere between the
   `ChipContent` extraction (commit `c8ecc73`) and the lint refactor
   (commit `fc81519`). Long chip labels truncate-with-ellipsis on row 1
   even though there is room on row 2 — and per Jake's correction:
   sometimes they don't truncate at all, just overflow.
2. The BottomTab nav bar scrolls off the page instead of staying
   pinned. Likely fallout from §F2b's
   `body { overflow-x: hidden; max-width: 100vw }` interacting with
   the BottomTab's `position: fixed` (or sticky) layer.

**Verification step before fixing**: open `main` on a clean dev server
(kill all other Next servers first) and reproduce both symptoms. If
they don't repro, close this entry as "stale-server artifact."

---

## §F37 — Smarter chip-label truncation (avoid ellipsis-makes-it-worse)

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

## §F38 — Template extras (FAB on `/day-templates`)

**Source**: Jake, 2026-05-18 (during F13 click-test — "shouldn't FAB just be the default way to add extra anything?").

**Status**: `pending`

**What**: extend the FAB / `FABTypePicker` pattern to the day-templates page so a user can add an extra event (bottle / pump / custom) directly onto a template. Adjacent to §F35 — "Travel day" template with a flight at 14:00 is the natural example. Both are the same underlying conceptual feature: **templates can carry events, not just ownership decorations.**

**Why fast-follow, not now**: ship the simpler Tomorrow FAB first (PR-tomorrow-fab) so the FAB pattern is the universal "add anything" affordance on day-shaped pages. Templates need a schema lift first; defer until §F35 (or the next time the user wants a recurring event on a non-default day).

**Current state**:
- `OwnershipTemplate` carries only `napOwners` + `wakeWindowOwners` — owner-slot decorations.
- The engine merges these with projected nap/wake events when a template is applied.
- Templates do NOT carry events of their own. No `extras` field. No engine code that emits events FROM a template.

**Plumbing change required**:

| Block | Work |
|---|---|
| Schema | Add `extras: Event[]` (or `templateExtras: TemplateExtra[]`) to `OwnershipTemplate`. A `TemplateExtra` is an event template (time + type + label + optional owner) that the engine materializes on the assigned day. |
| Engine | New rule (or extension of an existing one) that emits `extras` from the active template as projected events on the day, in addition to the existing nap/ww/bottle/pump cascade. |
| Defaulter | Migrate older templates (which have no `extras`) on read — empty array. |
| UI | FAB on `/day-templates` opens the same `FABTypePicker`. `onSelect` adds an extra to `activeTemplate.extras` and persists. Edit/delete already covered by the existing drawer flow. |
| Date / Tomorrow | `/tomorrow` already gets extras via the FAB. Template extras should also appear in the Tomorrow preview when its weekday-default (or override per §F35) selects that template. |

**Design questions to settle**:

| Question | Options |
|---|---|
| Where do extras live on the doc? | Flat `Event[]` (denormalized) vs. a thinner `TemplateExtra` shape with just the time/type/label and owner. **Lean: thinner shape** — Event has lifecycle/dayId fields that don't belong on a re-usable template. |
| How does the engine identify a template-emitted event vs a recorded extra? | `lifecycle.state = "projected"` + a marker like `source: "template"` so the existing recorded-wins rule still applies cleanly. |
| Edit vs override per day? | Editing a template extra on Tomorrow's preview should NOT mutate the template — that's an override for the specific date (like recording an actual event). Same recorded-wins semantics. |

**Acceptance**:
- User can FAB-add a bottle/pump/custom to Sat or Sun template.
- The added event appears on `/day-templates` preview at its time.
- On `/tomorrow` for a date whose template carries the extra, the preview shows it as a projected event.
- Promoting Tomorrow → today materializes template extras as recorded events on the new day doc.
- Editing the extra on tomorrow's preview overrides for that date only — the template stays unchanged.
- Recorded actuals still win over template-projected extras on the same date.

**Out of scope**:
- Recurring extras (weekly, daily) — covered separately by `Settings.dailyRecurring` which already exists for a single repeating event.
- Time-shifted extras (e.g., "5h after wake" vs "at 12:00") — start with fixed times.

**Estimated effort**: ~2-3 days. Schema + engine rule + defaulter migration + UI + ~6-8 new tests (engine emit + recorded-wins-over-template-extra + round-trip + UI add/edit/delete + Tomorrow integration).

---

## §F40 — Display settings: rename + dense/normal/spacious preset

**Source**: Jake, 2026-05-19 (after Daycare/Daily-recurring panels landed).

**Status**: `pending`

**What**:
1. Rename the **"Timeline display"** Settings section → **"Display settings"** (broader scope; future display-related toggles land here).
2. Replace the manual `timelinePxPerHour` number input with a **three-way preset**: dense / normal / spacious.

**Suggested preset mapping** (final values TBD by click-test):

| Preset | px/hour |
|---|---|
| Dense | 80 |
| Normal | 120 *(current default)* |
| Spacious | 180 |

**Design question to settle**: storage shape.

| Option | Trade-off |
|---|---|
| **A — Keep `timelinePxPerHour: number`**, UI maps preset → px on write, snaps to nearest preset on read | Zero schema/engine churn. Defaulter unchanged. UI does the mapping. |
| **B — Add `timelineDensity: "dense" \| "normal" \| "spacious"`**, derive px in render | Cleaner semantic doc. Requires schema migration + defaulter rewrite. Engine read path unchanged (still uses a number derived from the preset). |

**Lean: A.** No reason to change the wire shape for what is purely a UI affordance. The dial just becomes three buttons writing one of three values; reading back snaps to the closest preset.

**Out of scope**:
- Free-form px input as an "Advanced" toggle (defer — solve the common case first).
- Per-page density (dashboard vs timeline). Today it's one setting; keep it global.

**Estimated effort**: ~1 hour. Settings page change + the slugified accordion key rename ("timeline-display" → "display-settings").

---

## §F41 — Post-onboarding tutorial / orientation surface

**Source**: Jake, 2026-05-19 — during §F3 click-test. "I hate 'wake up' as the only button on the screen as soon as onboarding is complete."

**Status**: `pending`

**What**: after a fresh §F3 onboarding submission, the user lands on the dashboard with just a single "Start first day" CTA centered on the page. There's no context about what the app does, what the timeline looks like once events are recorded, or what the next interaction should be after the day is started. A short tutorial (coachmarks, a guided tour, or a static "what to expect" panel) would orient a brand-new user.

**Why fast-follow, not now**: §F3 PR #1 ships the bare-minimum welcome flow. Tutorial design is a separate UX project and shouldn't gate first dogfood use (Jake + Kelly already know the app). Becomes important the moment a third user touches the app.

**Acceptance** (sketch — design pass required first):
- First-day-empty state shows more than the "Start first day" CTA — at minimum a short paragraph or 3-bullet "here's what happens next" panel.
- Optional: progressive coachmarks on first dashboard render, first FAB tap, first event recorded.
- Dismissible per-user (write to `/users/{uid}.onboardingComplete` or similar).

**Estimated effort**: 1–2 days for a static "what to expect" panel; 2–3 days for proper coachmarks.

---

## §F42 — Input-field font (not programmer-y)

**Source**: Jake, 2026-05-19 — during §F3 welcome click-test. "Fast-follow on the font for input fields — it's too programmer-y."

**Status**: `pending`

**What**: the welcome form's `<input type="text">` / `<input type="date">` / `<input type="time">` fields render in the browser default monospace-ish font (likely inherited from a `body { font-family }` chain that doesn't reach inputs by default). The rest of the app uses a humanist sans (see `tokens.css` / globals.css). Align all `<input>` fonts to the app's body font.

**Likely fix**: one rule in `globals.css` or `tokens.css`:
```css
input, textarea, select, button {
  font-family: inherit;
}
```
Plus visual QA pass on every form (welcome, settings, drawer time picker, day-templates, tomorrow extras).

**Why fast-follow**: pure styling, no behavior change. Bundle with §F2c if §F2c still has visual issues, or its own one-line PR.

**Estimated effort**: 30 minutes + QA sweep.

---

## §F43 — Timeline visual indicator for events during daycare window

**Source**: Jake, 2026-05-19 (Daycare redesign — see PR #189).

**Status**: `pending`

**What**: a subtle visual cue on Timeline event blocks/chips that fall between `daycare.dropoffTime` and `daycare.pickupTime` on a daycare weekday. Communicates "this happens at daycare" without polluting the event's `owner` field.

**Why fast-follow**: PR #189 deleted R21.3 (which used to stamp the daycare owner on these events). The replacement is purely visual — no schema or engine change, just CSS + a derived attribute in the render pipeline.

**Plumbing**:
- Render layer (`renderProjection.ts` or `TimelineV3` block factory) tags events whose `startTime` falls in `[dropoff, pickup)` with `data-during-daycare` when daycare is active for the day.
- `Block.module.css` adds `.block[data-during-daycare] { background: var(--color-owner-daycare-tint); border-left: 3px solid var(--color-owner-daycare); }` or similar.
- Read the daycare window from the projected `daycare_dropoff` / `daycare_pickup` events (already emitted by R21.1), not from settings — this picks up recorded-shifted windows automatically.

**Acceptance**:
- On a weekday with daycare enabled, projected naps/bottles between dropoff and pickup show the visual cue.
- The cue does NOT appear on suppressed daycare days (`Day.suppressedDaycareDay = true`).
- The cue updates if the user records dropoff/pickup at different times than projected.
- Recorded events keep the cue too — daycare doesn't stop being daycare just because the user logged the nap.

**Estimated effort**: ~30-60 min. One CSS class + one renderProjection attribute pass + a single integration test.

---

## §F44 — Auto-assign "Daycare" as event owner once a day has dropoff+pickup recorded

**Source**: Jake, 2026-05-19. **Nice-to-have**, explicitly NOT critical.

**Status**: `pending`

**What**: optional flavor of the deleted R21.3 behavior. When a Day has BOTH a recorded `daycare_dropoff` and `daycare_pickup` actual, projected events between those recorded times can opt-in to inherit a "Daycare" owner (would need a "Daycare" entry in `owners.other[]`). Different from the original R21.3 in two ways:

1. **Opt-in via settings flag** (e.g. `daycare.autoAssignOwner: boolean`) — default off.
2. **Triggered by recorded events**, not by enable+weekday — only fires once the user has actually committed dropoff and pickup actuals.

**Why deferred**: the §F43 visual indicator already gives the user the "this is at daycare" signal without owner-field pollution. Owner-stamping is only useful if a downstream consumer (analytics, history view, ownership reports) actually filters/groups by `owner.slot === "other" && otherId === daycareId`. Today no such consumer exists.

**Out of scope until needed**:
- Auto-creating the "Daycare" entry in `owners.other[]` (would re-introduce the auto-create logic we just deleted).
- Backfilling already-completed days.

**Estimated effort**: ~1 day if implemented from scratch with the settings flag + opt-in behavior + tests. ~½ day if we choose to make it global (no flag, just "if a Daycare other-owner exists").

---

## §F45 — /history/[date] detail header: bottle count + total oz + nap count

**Source**: Jake, 2026-05-21 — clicking into a history day shows just the timeline, no roll-up stats.

**Status**: `pending`

**What**: render a small summary row at the top of `/history/[date]` showing the day's totals — e.g. `3 bottles · 18 oz · 4 naps · 4h 30m sleep`. Same shape as the existing `HistoryDayCard` summary (`HistoryDayCardSummary`) but at the page header. Optional: surface percentile/target deltas vs settings defaults.

**Why fast-follow**: pure render layer; no engine work. Settings already carry the daily targets that would let us color a "X over/under target" indicator if we want.

**Estimated effort**: ~half evening. Component already exists for the list-card variant; just thread the data + style at the page-header position.

---

## §F47 — Square focus outline on InstantChip (block focus outline is rounded)

**Source**: Jake, 2026-05-21.

**Status**: `pending`

**What**: focus-visible outlines on Block (`src/v3/components/Timeline/Block.module.css`) appear with rounded corners, but the same-shape rule on InstantChip (`src/v3/components/Timeline/InstantChip.module.css`) looks square. Both use identical `outline: 2px solid var(--color-accent); outline-offset: 1px;` with `border-radius` set.

**Cause**: at chip size (~24px tall, 12px radius), the `outline-offset: 1px` gap visually flattens the corner. Browsers follow border-radius on outlines but the perceptual effect at small sizes makes it look square. Block (50–100px tall) doesn't suffer the same issue.

**Fix shape**: swap `outline` → `box-shadow: 0 0 0 2px var(--color-accent)` (respects radius perfectly, no offset gap). Apply consistently to Block too. Test against keyboard nav and screen-reader focus paths.

**Why fast-follow**: visual polish; no semantic change.

**Estimated effort**: ~½ hr (CSS + one cross-browser visual check + verify focus order intact).

---

## §F48 — "Last nap" line on dashboard shows wrong time after manual edit

**Source**: Jake, 2026-05-22.

**Status**: `pending`

**What**: Manually edited the most recent nap on /timeline. The dashboard's "Last nap" line then read `"45m, 0 min ago (4:02p)"` — but it was ~2:30pm at the time, so 4:02p was ~2.5 hrs in the *future*. Two related symptoms:
1. Display string says "0 min ago" but the time shown is in the future.
2. Either the "ago" is computed off the original nap timestamp (pre-edit) while the parenthetical clock is post-edit, or the nap actually projected forward and the dashboard picked the projected nap as "last."

**Hypotheses (need triage)**:
- The dashboard "Last nap" summary may be reading the projected/predicted nap list rather than actual `nap` events, so an actual nap that ended in the past but had its end-time edited to a future time gets flagged as still in-progress AND the summary sees the *next projected* nap as "last".
- "0 min ago" suggests `Math.max(0, now - endTime)` clamping on a negative delta — when endTime > now, the delta is negative and gets clamped to 0, but the clock string is still rendered from the raw (future) endTime.

**Fix shape**: locate the "Last nap" summary component; verify it filters to events where `endTime <= now` before picking the most recent; show "in progress" / "ends in N min" when endTime is in the future, not "0 min ago".

**Why fast-follow**: not blocking V3 functionality, but visibly wrong to a user dog-fooding the app.

**Estimated effort**: ~1–2 hr (triage + fix + add seam test for the wrong-direction edit case).

---

## §F49 — Sync button: real refresh + spinner→check animation

**Source**: Jake, 2026-05-22 dog-fooding feedback.

**Status**: `pending`

**What**: The cloud-sync button in the app shell is a visual-only no-op today (no `onRefresh` prop wired in `AppShell`). When Jake's wife Kelly accepted the invite, her dashboard showed 0 events even after both pushed sync. Two pieces:
1. Actually trigger a network refresh: `disableNetwork(db)` then `enableNetwork(db)` to force Firestore to re-establish its listen streams (or, lighter touch, call `getDocs()` against `users/{uid}` and the active day's events with `source: 'server'`).
2. Replace the static icon with an animation: idle → spinner while pending → check (1.5s) → idle.

**Why fast-follow**: ships co-parent dog-fooding; cosmetic spinner without real refresh is worse than no button.

**Estimated effort**: ~½–1 hr.

---

## §F50 — Display settings: font-size sm / md / lg

**Source**: Jake, 2026-05-22.

**Status**: `pending`

**What**: Add a font-size selector (sm / md / lg) to Settings → Display alongside the existing timeline px/hour control. Wire to `--text-base` and let the cascade flow.

**Why fast-follow**: accessibility nice-to-have; not blocking.

**Estimated effort**: ~1 hr (settings field + CSS variable wiring + test).

---

## §F51 — Extend yesterday's overnight bedtime block to first wake event

**Source**: Jake, 2026-05-22.

**Status**: `pending`

**What**: On `/timeline`, the overnight bedtime block from yesterday currently ends at midnight (or wherever the previous day's projection capped it). It should visually extend down to the first wake event of today — so the user sees a continuous "sleep" lane from yesterday's putdown to today's wake-up.

**Why fast-follow**: visual continuity; doesn't change any underlying data.

**Estimated effort**: ~1–2 hr (projection layer or render-time stitching of cross-day bedtime block).

---

## §F53 — Recurring events with duration render behind other events

**Source**: Jake, 2026-05-23.

**Status**: `pending`

**What**: Recurring duration blocks (e.g. a daily 3pm walk) paint underneath naps / wake_windows / extras that overlap them. Likely cause: `TimelineV3.zOrder()` doesn't recognize recurring events as a distinct class and they fall through to the default `z=1` (wake_window-tier).

**Fix shape**: extend `zOrder()` in `src/v3/components/Timeline/TimelineV3.tsx` to give recurring blocks a tier above wake_windows but below naps (probably tier 1.5 → bump everything else, or add explicit recurring case).

**Estimated effort**: ~15 min once we confirm the canonical recurring-event discriminator (`isRecurring`? `event.recurringId`? — read the schema).

---

## §F54 — Overnight bottle cascade should recalc when overnight bottle is close to wake

**Source**: Jake, 2026-05-23.

**Status**: `pending` (engine-shaped; may need a brief grill before coding)

**What**: If an overnight bottle (e.g. 6oz at 5am) falls within one cascade "rule" of the projected first bottle of the day (e.g. 6oz at 7am wake), the bottle cascade should reflect what actually happened — baby isn't going to want 6oz two hours after 6oz. Today, the cascade ignores the overnight bottle and schedules the morning bottle as if the baby woke from a full sleep.

**Hypothesis**: the cascade's "anchor" is the first wake-up of the day, not the most-recent actual bottle. The fix likely involves looking back across the night boundary to find the most-recent actual bottle event, and shifting/sizing the morning bottle off THAT anchor.

**Risks**: tread carefully — bottle rules are the canonical "step back" trigger zone (per `feedback_step_back_when_complex` + 2026-05-12 simplification). Grill the model before coding so we don't add another patch-on-patch rule.

**Estimated effort**: grill (~30 min) → ~1-2 hr engine + tests.

---

## §F55 — Overlapping instants UX (first label hidden, recurring drawer missing title, general polish)

**Source**: Jake, 2026-05-23.

**Status**: `pending`

**What**: When two or more instant events fall within ~X minutes of each other, the cluster renders such that:
1. The FIRST event's label is hidden / clipped.
2. If the first event is a recurring event, there's also no label in the drawer when tapped (see §F56, which is the same root cause manifesting in the drawer surface).
3. The general visual treatment of clustered instants "just looks bad" — needs an iteration pass for non-recurring too.

**Files likely involved**: `src/v3/components/Timeline/InstantCluster.tsx`, `groupInstants.ts`, `InstantChip.tsx`.

**Bundle**: ship with §F56 (drawer-title fix) since it's the same root cause for the recurring sub-case.

**Estimated effort**: ~1-2 hr (render iteration + drawer fix bundled).

---

## §F56 — Recurring event drawer should show the event title

**Source**: Jake, 2026-05-23.

**Status**: `pending` (bundle with §F55)

**What**: Tapping a recurring event opens the EventEditDrawerV3 with no title field populated. For good UX, the drawer should show the recurring event's name (e.g. "Tummy time", "Walk", etc.).

**Fix shape**: `EventEditDrawerV3` likely resolves title via `event.label`, but recurring events may use `recurringId` to look up the name from `Settings.dailyRecurring[]`. Hydrate the title from there when present.

**Estimated effort**: ~15 min (bundled with §F55).

---

## §F57 — Extra event with duration overlapping pump block renders as ellipses

**Source**: Jake, 2026-05-23.

**Status**: `pending`

**What**: When an extra event with a duration overlaps a pump block in time, the layout correctly fans them horizontally — but the extra event's label text is replaced with ellipses ("…") instead of the title. Pump renders fine.

**Cause hypothesis**: when the extra block's width is halved by the fan layout, the title CSS `text-overflow: ellipsis` triggers because the rendered width is below the threshold for the full label. Likely a width / min-width / padding issue in `Block.module.css` for the extra+pump fanned state.

**Fix shape**: audit Block.module.css for the fanned-extra layout; either bump the line-height / wrapping to two lines, or shorten the chrome padding when the block is narrow, or use a smaller label font in the fanned state.

**Estimated effort**: ~30 min (CSS iteration + visual verification).

---

## §F58 — Dream Feed: render at a configurable default time, always visible

**Source**: Jake, 2026-05-23.

**Status**: `pending` (needs design grill before coding)

**What**: Currently, the dream feed bottle doesn't display on the timeline even with the right `bottlesPerDay` budget — Jake has to manually add one. Proposed shape: add a `defaultTime` field to Dream Feed settings; the dream feed bottle always renders at that time, and can be edited/adjusted (record actual time, skip, etc.).

**Open design questions** (grill before coding):
- Does the dream feed count toward the day's `bottlesPerDay` total, or is it additive?
- If the baby wakes BEFORE the dream feed time (e.g. baby wakes at 11:30pm and dream feed default is 11pm), what happens? Skip it, shift it, or render it anyway?
- Does enabling the dream feed surface a *new* event type or just a flagged bottle?
- How does the "skip" path interact with the cascade for the next-morning bottle?

**Why fast-follow / blocking**: currently Jake's manually adding a bottle every night, so this is real friction. But the model has a million edge cases — get the design crisp before shipping anything.

**Estimated effort**: grill (~30 min) → ~1-2 hr settings field + engine + tests.

---

## §F59 — Unify write-path id conventions for slot-keyed events + orphan cleanup

**Source**: Jake, 2026-05-22 (chat: "drawer bug"). Follow-up to PR #232.

**Status**: `in-progress`

**What**: Three writers use inconsistent Firestore doc-id conventions for the same logical slot:

| Caller | Doc id written | `eventKey` |
|---|---|---|
| `NapActionButton.tsx:132` (Start Nap Now) | `nap_N` | `nap_N` |
| `NapActionButton.tsx:103` (Start Bedtime Now) | `bedtime` | `bedtime` |
| `EventEditDrawerV3.tsx:248` (Change-to-bedtime confirm) | `bedtime` | `bedtime` |
| `useDrawer.ts:81` (drawer edits on projected events, per PR #186) | `recorded_${eventKey}` | `<eventKey>` |

If a user drawer-edits projected Nap N then taps "Start Nap Now" on that slot, Firestore ends up with two docs (`nap_N` + `recorded_nap_N`), both `eventKey: nap_N`. PR #232 hides the second one at the render layer; this fast-follow eliminates the orphan write at the source.

**Direction: Option A** — `NapActionButton` and `EventEditDrawerV3` adopt `recorded_${eventKey}` to match the drawer + daycare's existing convention. Fewer breaking changes for existing data than flipping the drawer to bare-eventKey.

**Also**: one-time read-side migration that detects duplicate `(type, eventKey)` doc pairs and deletes the loser (PR #232's policy: most-recent annotation wins, stable id tie-break). After this lands, the render dedup in `renderProjection.ts` becomes a defensive net rather than the primary fix.

**Why fast-follow**: PR #232 closes the user-visible symptom; the root cause is real but not urgent now that the symptom is gone.

**Estimated effort**: ~2–3 hr (single PR for convention + migration).

**Acceptance**:
- `grep -rn "id: \"nap_\|id: \"bedtime\"\|id: mode.projected.eventKey" src/` returns zero matches in production code.
- New integration test: drawer-edit followed by Start-Nap-Now produces exactly one Firestore doc.
- One-time migration deletes orphan loser docs on day load.

---

## §F62 — Bottle cascade canCascade idempotency hole when §F54 seed snaps below wakeTime

**Source**: code-reviewer on PR #241, 2026-05-24.

**Status**: `pending`

**What**: In `projectBottleChain`'s cold-start branch (`src/v3/engine/rules/bottles.ts:336-343`), if `snap(seedTime)` returns a value `< wakeTime` (a recorded nap straddling wake pulls the seed backward), the function returns early without adding a projection. But `canCascade`'s cold-start predicate at L223 (`chainBottles.length < target`) still returns `true` — so the evaluator re-fires the rule indefinitely until it hits its fixed-point ceiling.

Pre-existed in spirit (the old `wakeBuffer` seed had the same shape), but PR #241's §F54 guard shifts the seed forward via `overnight.startTime + interval`, making the seed land deeper into morning naps that weren't a hazard before — so the failure mode is more reachable now.

**Fix shape**: in `canCascade`'s cold-start branch, replicate the seed-validity check from `projectBottleChain`. If the proposed seed snaps to `< wakeTime` or `>= cap`, return `false` (no more projections possible). Requires duplicating ~5 lines of seed logic in the predicate, OR factoring `computeColdStartSeed()` into a shared helper.

**Why fast-follow**: failure mode requires a specific data shape (recorded nap straddling wake + cold-start day + an overnight bottle close enough to wake to shift the seed into the nap region). Unlikely in dogfood; not a CRITICAL prod bug. Real but rare.

**Acceptance**:
- New `bottles.test.ts` case seeds a recorded nap straddling wake + an overnight bottle that would shift the seed into that nap; asserts `projectBottleChain` converges in one pass (or in a bounded number of passes set by the evaluator).
- `canCascade` returns `false` once seed placement is impossible.

**Estimated effort**: ~1-2 hr (small code change + careful test that locks the convergence semantics).

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
