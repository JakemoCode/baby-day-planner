# V3 Fast-Follow — Completed

Compressed history of items that originated in `FAST_FOLLOW.md` and
have since shipped. Kept for audit trail and future reference.

When an item completes, compress its entry to: heading + 1-sentence
description + the PR that shipped it. Drop the "Why fast-follow" and
"Estimated effort" rationale.

---

## §F1 — Settings page collapsible accordion

Shipped in **PR #172** (`feat/settings-accordion`). Settings sections
(Times, Bottle, Naps, Owners, Daycare, Members, …) collapse to one
open at a time; selection persists per-device via localStorage.

## §F2 — Palette refresh

Shipped in two coordinated PRs after the palette-explore Variant A pick:
- **PR #176** (`worktree-f2a-surface-contrast`) — §F2a: `--color-bg`
  cream→deeper cream (`#fbf8f3` → `#f2ebde`); `NextBottlePanel` +
  `NextSleepPanel` gain a 4px sage `--color-accent-soft` side-band.
  Bg→surface contrast 1.06 → 1.19.
- **PR #178** (`worktree-f2b-timeline-palette`) — §F2b: timeline
  type-coded chip dots, honey-tinted extras, bolder hour ticks,
  phased chip layout (short keeps time inline; long drops time to
  row 2). Closed by `fc81519` chip-cluster centering follow-up.

## §F13 — TemplateOwnerPicker owns its own chrome

Shipped in **PR #175** (`feat/template-owner-picker-chrome`).
`TemplateOwnerPicker` gained `onCancel` + a title slot; DayTemplates
page dropped its `.pickerWrap` / `.pickerHeader` / `.pickerLabel` /
`.pickerCancel` workaround. Companion refactor extracted `BottomSheet`
from `FABTypePicker` so the picker reuses it.

## §F7 — Delete the V2 ← V3 back-compat shim

Shipped in **PR-C1** (commit `bacebe4`, merged 2026-05-11). Removed
`v2Backcompat.ts`, all V2 hooks (`useDays`, `useEvents`, etc.), V2
components under `src/components/`, the entire `src/domain/`
directory, and `src/lib/firestore/converters.ts`. V3 is the single
runtime.

## §F9 — Audit Timeline V2 test coverage

Performed during V3 cutover preparation; output captured in
`docs/_archive/v3/F9_TEST_AUDIT.md`. The audit identified the
V2-test → V3-engine port obligations that gated PR-C1; all
identified gaps were either ported or explicitly waived before the
V2 wipe.

## §F20 — Changing nap time removes putdown

Shipped in two coordinated PRs:
- **PR #117** — `formToEvent` now treats drawer time-edits on scheduling
  types (`nap`, `bedtime`, `daily_recurring`) as `overridden` rather than
  promoting to `completed`. Preserves putdown gate eligibility.
- **PR #122** — Naps rule cascade made unconditional:
  `wake_window(N).endTime === nap(N).startTime` regardless of nap
  lifecycle. Removed the lifecycle-branched anchor that left a gap when
  PR #117 produced an `overridden` nap.

Putdown is render-only and now re-derives correctly from edited naps.

## §F22 — Drawer save-path: route bottles to the correct calendar day

Shipped in **PR #143** (commit `d15731f`). Drawer save-path now routes
writes to the correct calendar day based on the event's `startTime`,
not the active `dayId` — so a 2 AM bottle attaches to the right day.

## §F24 — Start Nap action creates duplicate nap instead of promoting projection

Shipped in **PR #143** (commit `d15731f`). NapActionButton now
promotes the next-projected nap's `eventKey` instead of inventing a
new `nap_${nextNumber}` slot, eliminating the side-by-side duplicate.
PR #143 follow-up (commit `4231f39`) added UUID `eventKey` for
off-pattern naps so they don't masquerade as cascade slots.

## §F25 — Manual nap recorded inside bedtime block claims `nap_1` eventKey

Shipped in **PR #143** (commit `d15731f`) alongside §F22/§F24 — the
save-path now scans existing naps for the next free `nap_N` slot
before assigning, so an in-bedtime manual nap no longer collides
with the day's actual `nap_1`.

## §F26 — Putdown chip synthesized for naps inside the bedtime block

Structurally closed by current `putdown.ts` lifecycle gate. The rule
only sets `hasPutdown=true` for `{projected, overridden}` lifecycles
— a manually-recorded nap is `started` or `completed`, so the
synthetic chip can no longer be emitted. No standalone fix needed.

## §F32 — Retire `EndOfDayCard`; dashboard always shows stats

Shipped in **PR #173** (merged 2026-05-18 as `dd14632`). Retired
EndOfDayCard's two early-return branches; reshaped dashboard around
always-visible `NextBottlePanel` + `NextSleepPanel` + unified `NowBanner`
(wake-window doubles as in-progress sleep banner). Wake gate replaced
with a slim "Wake up" CTA. `StartDayButton` is dev-only. New
`dashboardStats.ts` helpers (totals, last-X, in-progress-skipping
next selector that also filters synthetic putdown render-blocks via
`eventKey === PUTDOWN_KIND_TAG`). Click-test pass caught + fixed
post-PR-open: synth-putdown leak into `NextEventCard`, missing card
chrome on stat panels, and a typography pass aligning panel hierarchy
with `NextEventCard` (hero accent time + delta + footer with totals).

Spec: `docs/_archive/superpowers/specs/2026-05-17-f32-retire-eod-design.md`.
Plan: `docs/_archive/superpowers/plans/2026-05-17-f32-retire-eod.md`.

## §F52 — Dashboard: kill scroll wobble

Shipped in **PR #231** (`chore/tomorrow-dev-promote-and-scroll-wobble`). `AppShell.shell` switched from `min-height: 100dvh` to `height: 100dvh + overflow: hidden`; `.main` becomes the scroll container with `overflow-y: auto + min-height: 0`. TimelineV3's scroll-to-now adapted via `findScrollParent()` to walk up to the nearest overflow ancestor (falls back to window for tests / out-of-shell mounts).

## §F3 — First-time user onboarding (dashboard)

Shipped via **PR #191** (`feat(v3): §F3/§F10`) and extended in **PR #229** (`feat(onboarding): step 3 first-day preview`). Welcome flow + ChildProvider gate replace the empty-dashboard crash; first-day preview lets the user assign owners pre-commit. All §F3 acceptance criteria met.

## §F10 — Onboarding flow: child name + DOB

Shipped alongside §F3 in **PR #191**. `useCurrentChild().id` replaces `NEXT_PUBLIC_DEFAULT_CHILD ?? "aden"` everywhere in production code paths. DOB collected at onboarding.

## §F12 — Confirm Tomorrow plan + auto-promote on Start Day

Absorbed into §F39 and shipped across **PRs #187** (TomorrowPlan schema), **#210/#212** (auto-rollover hook), and **#230** (UI: autosave + confirm pill + draft dot + chip-tap owner picker). The /tomorrow page now persists a draft → confirm → auto-applies-at-midnight model via `useReconcileActiveDay`.

## §F15 — Migrate duplicating test fixture files to `aSettings()` factory

All six listed files now consume `aSettings()` — verified by grep against the audit list (`page.test.tsx`, `tomorrow/page.test.tsx`, `day-templates/page.test.tsx`, `TomorrowPreview.test.tsx`, `createEventTemplate.test.ts`, `settings.test.ts`). No standalone PR — landed organically as the engine rewrite progressed.

## §F16 — Settings page row helpers should use CSS Modules

Verified clean (2026-05-23 audit): 0 `style={{}}` hits in `src/app/(signed-in-with-child)/settings/`. Inline styles were removed organically as the settings UI evolved through subsequent PRs.

## §F17 — Deprecate "Start Day" button; auto-anchor day at `defaultWakeTime`

Shipped across **PRs #210/#212**. `useReconcileActiveDay` auto-anchors the day via `getOrCreatePlannedDay`; the legacy "Start Day" button is now gated behind `process.env.NODE_ENV === "development"` as dev scaffolding only. Day creation no longer requires user interaction.

## §F18 — Retroactive edit of the day's wake time

Shipped in **PR #228** (`feat(dashboard): edit today's wake time after the fact`). `EditableWakeTime` component on /timeline lets the user back-edit a day's wake time via inline `<input type="time">`; writes to `Day.wakeTime` and rebuilds the cascade.

## §F36 — Owner cannot be unassigned from blocks or instant chips

Shipped in **PR #186** (commit `e63dc67`). `Event.owner` is now required with `NO_OWNER = { slot: "none" }` as the absence value; OwnerPickerV3 surfaces a "None" option. Schema invariant locked via seam test.

## §F39 — Tomorrow as a fully-editable plan with auto-promote at wake

Three-PR arc complete: **PR #187** (TomorrowPlan schema + repo), **PR #212** (engine integration + auto-rollover via `useReconcileActiveDay`), **PR #230** (UI: `useTomorrowPlanState` + `useAutosaveTomorrowPlan` + `useV3TomorrowDraftCount` + chip-tap owner picker + draft pill + nav-dot).

## §F46 — /tomorrow chip tap → drawer (not owner picker)

Absorbed into the §F39 arc and shipped in **PR #230**. Chip tap on projected events opens the OwnerPickerV3 BottomSheet which writes to `TomorrowPlan.ownerOverrides[eventKey]`. Extras still get the full EventEditDrawerV3.

## §F65 — Delete recurring event from today's timeline

Shipped in **PR #245** (`feat/f65-delete-recurring-from-today`). New
repo fn `suppressRecurringForDay` (arrayUnion into
`Day.suppressedRecurringIds`); `useDrawer` routes `daily_recurring`
delete through it; `EventEditDrawerV3` shows a Delete button on
projected recurring events with "Skip <event> today? It'll come back
tomorrow." confirmation copy. Engine's R11.6 already honored
suppression — this just adds the UI affordance.

## §F55 — Collapse 2+ overlapping instant chips into a "N events" chip + sheet

Shipped in **PR #244** (`fix/f55-f56-f57-render-polish`). Two or more
instant events whose vertical chip ranges would overlap collapse into a
single "N events · 5:30–5:35p" chip. Tap opens a `BottomSheet` (new
`GroupedEventsSheet`) listing each event; row tap routes to the existing
`EventEditDrawerV3`. Detection in `mergeNearbyGroups(groups, collisionMin)`
runs after `groupInstants`; threshold scales with `pxPerMin`. Chip stacks
label / time-range / "Tap to view" on three lines.

## §F56 — Recurring event drawer heading shows the event name

Shipped in **PR #244** (`fix/f55-f56-f57-render-polish`). The
`EventEditDrawerV3` h2 now reads "Edit recurring event: Tummy time"
instead of the generic "Edit recurring event."
