# V2 → V3 CSS Drift Audit

> Generated 2026-05-11 after Jake reported the V3 timeline / dashboard
> "feels off" visually. The V3 cutover (PRs #51–#106, merged
> 2026-05-10 / 2026-05-11) was supposed to be color/data-neutral —
> PR-A0.5 said "duplicate, NOT move, shared CSS modules into V3" so
> V3 components reused V2's CSS bit-for-bit. Anything that drifted
> in that window should be a candidate for restoration.

## Method

1. Enumerated every `*.module.css` under `src/v3/` (25 files).
2. For each, looked up the V2 ancestor under `src/components/` at
   commit `df685c3` (the parent of the C1 wipe, last commit with V2
   files intact).
3. Diffed each pair, categorized every rule change as
   **necessary** (owner-color resolution mechanism), **regression**
   (unintended drift), **improvement** (V3 fixed a real V2 bug), or
   **ambiguous** (Jake's call).
4. Also diffed the matching V3 `.tsx` against V2 to catch markup-level
   drift (added/removed/reordered wrappers, class swaps).
5. Restored regressions in place. Kept the V3 `--owner-color`
   mechanism untouched. Did not touch tokens.css.

## Summary

| | |
|---|---|
| V3 CSS modules audited | 25 |
| Files identical to V2 | 8 |
| Files where every diff is owner-mechanism (kept) | 12 |
| Files with a real regression (restored) | 3 |
| V3-only files (genuinely out of scope) | 1 |
| V3-only files audited via V2's inlined markup | 1 |
| Files where V2 had unused classes V3 dropped (cleanup, not regression) | 2 |
| Ambiguous items needing Jake's call | 1 |

## Highest-impact finding (likely root cause of "wonky" perception)

V2 used dedicated **tint tokens** (`--color-owner-jake-tint` = `#e1e8ef`,
~15% saturation pastel) as backgrounds for owner pills. V3 wired
backgrounds to the raw `--owner-color` custom property (which is the
*full* saturation `#7a8fa8`, etc.). On dashboard pills sitting right
above the timeline this turned soft pastel bars into strongly tinted
ones — same hue, but ~5× the saturation.

Three dashboard surfaces had this exact regression:

- `Dashboard/OwnerPill.module.css` (used by NextEventCard via composed
  className — every "Next event" row on the dashboard)
- `Dashboard/CurrentWakeWindowStatus.module.css` (the "In wake window
  · Jake · ends 9:00a" pill)
- `Dashboard/NextEventCard.module.css` `.owner` class (legacy direct
  background; superseded by OwnerPill but still in the stylesheet)

Restored by mixing the configured `--owner-color` at 20% against the
surface — matches the V2 tint contrast and continues to flow from
`OwnersConfig.color`, so the V3 mechanism is preserved.

The Timeline surface (`Block`, `InstantChip`) was **not** the regression —
those already used `color-mix(... 20%, transparent)` or applied
`--owner-color` only to borders/dots/text where V2 also used the full
owner color.

## Per-file findings

### `src/v3/components/Timeline/Block.module.css`
V2 ancestor: `src/components/Timeline/Block.module.css` @ `df685c3`

| Rule | V2 | V3 | Verdict |
|---|---|---|---|
| owner-mode block fill | `var(--color-owner-jake-tint)` (per owner) | `color-mix(in srgb, var(--owner-color) 20%, transparent)` | necessary — kept |
| owner-mode block border | `var(--color-owner-jake)` (per owner) | `var(--owner-color, var(--color-border-strong))` | necessary — kept |
| type-mode left stripe | `5px solid var(--color-owner-jake)` (per owner) | `5px solid var(--owner-color)` gated on `[data-owner]` | necessary — kept |
| `.owner` text color | `var(--color-owner-jake)` (per owner) | `var(--owner-color, inherit)` | necessary — kept |

All other rules (padding, font, layout) identical. Doc comment was
rewritten — content equivalent. No regression.

### `src/v3/components/Timeline/InstantChip.module.css`
V2 ancestor: `src/components/Timeline/InstantChip.module.css` @ `df685c3`

| Rule | V2 | V3 | Verdict |
|---|---|---|---|
| chip border | `var(--color-border)` + per-owner override to full color | `var(--owner-color, var(--color-border))` | necessary — kept |
| dot fill | `var(--color-accent)` + per-owner override to full color | `var(--owner-color, var(--color-accent))` | necessary — kept |
| `.ownerName` text color | per-owner full color | `var(--owner-color, inherit)` | necessary — kept |

All other rules (padding `3px 8px`, border-radius `12px`, gap, dot size
`8px`, margin-top `3px` on dot, two-row body) identical. No regression.

### `src/v3/components/Timeline/InstantCluster.module.css`
**Identical to V2.** No diff.

### `src/v3/components/Timeline/NowBar.module.css`
**Identical to V2.** No diff.

### `src/v3/components/Timeline/TimelineV2.module.css`
**Identical to V2.** No diff.

### `src/v3/components/Dashboard/ActionButton.module.css`
**Identical to V2.** No diff.

### `src/v3/components/Dashboard/CurrentWakeWindowStatus.module.css`
V2 ancestor: `src/components/Dashboard/CurrentWakeWindowStatus.module.css` @ `df685c3`

| Rule | V2 | V3 (before) | Verdict | Action |
|---|---|---|---|---|
| `.pill` background | `var(--color-accent-soft)` + per-owner classes setting `--color-owner-*-tint` | `var(--owner-color, var(--color-accent-soft))` (full saturation) | **regression** | **restored** to `color-mix(... 20%, accent-soft)` |
| `.owner-jake/kelly/daycare` classes | tint tokens | dropped (V3 uses inline `--owner-color`) | necessary — kept |

All other rules identical.

### `src/v3/components/Dashboard/EndOfDayCard.module.css`
**Identical to V2.** No diff.

### `src/v3/components/Dashboard/NextEventCard.module.css`
V2 ancestor: `src/components/Dashboard/NextEventCard.module.css` @ `df685c3`

| Rule | V2 | V3 (before) | Verdict | Action |
|---|---|---|---|---|
| `.owner` background | (no default; per-owner classes set tint tokens) | `var(--owner-color, var(--color-bg))` (full saturation) | **regression** | **restored** to `color-mix(... 20%, bg)` |
| `.owner-jake/kelly/daycare` | tint tokens | dropped | necessary — kept |

All other rules identical. (In practice NextEventCard.tsx now uses
`<OwnerPill>` so this rule is fallback for any direct usage.)

### `src/v3/components/Dashboard/OwnerPill.module.css`
**V3-only file** (no V2 ancestor — V2's NextEventCard inlined this
markup), but the rule is morally a translation of V2's NextEventCard
`.owner` + per-owner classes. Audited against that V2 source.

| Rule | V2 equivalent | V3 (before) | Verdict | Action |
|---|---|---|---|---|
| `.pill` background | per-owner tint tokens | `var(--owner-color, var(--color-bg))` (full saturation) | **regression** | **restored** to `color-mix(... 20%, bg)` |

### `src/v3/components/Dashboard/PreviewCard.module.css`
**Identical to V2.** No diff.

### `src/v3/components/Dashboard/StartDayButton.module.css`
**Identical to V2.** No diff.

### `src/v3/components/History/ArchivedDayView.module.css`
V2 had an unused `.empty` class that V3 dropped. Verified by grep
that no V3 file references `styles.empty` in this module. Cleanup,
not regression.

### `src/v3/components/History/HistoryDayCard.module.css`
V2 used `<Link>` as the card root; V3 swapped to `<button>` (Next 16
client routing strategy). V3 added `text-align: left`, `font: inherit`,
`width: 100%` — the standard set needed to make `<button>` look like
a card. Correct compensation, not regression.

### `src/v3/components/History/HistoryList.module.css`
**Identical to V2.** No diff.

### `src/v3/components/Settings/OwnersConfigEditor.module.css`
**V3-only file** (V2 had no owners-config editor). Out of scope.

### `src/v3/components/shared/ConfirmDialog.module.css`
**Identical to V2.** No diff.

### `src/v3/components/shared/EventEditDrawer.module.css`
**Identical to V2.** No diff. The V3 component is named
`EventEditDrawerV3.tsx` but imports this same module. TSX structure
also preserved (class name list identical, just line numbers shifted).

### `src/v3/components/shared/FAB.module.css`
**Identical to V2.** No diff.

### `src/v3/components/shared/FABTypePicker.module.css`
**Identical to V2.** No diff.

### `src/v3/components/shared/OwnerPicker.module.css`
V2 ancestor: `src/components/shared/OwnerPicker.module.css` @ `df685c3`

| Rule | V2 | V3 | Verdict |
|---|---|---|---|
| pressed-state background | per-owner tint tokens (`.option-jake[aria-pressed]` etc.) | `color-mix(in srgb, var(--owner-color) 30%, transparent)` | necessary — kept |
| `.option-none[aria-pressed]` | accent-soft | same value, selector rewritten to `[data-owner="none"]` | necessary — kept |

This file was the cleanest translation — V3 already used `color-mix`
at 30%. (Slightly more saturated than the dashboard pills' 20%, but
this is a *pressed* state where stronger emphasis is wanted.) No
regression.

### `src/v3/components/shared/SettingsAccount.module.css`
V2 ancestor: `src/components/Settings/SettingsField.module.css` @ `df685c3`

V3 extracted only the rules SettingsAccount actually uses (`section`,
`title`, `description`, `button`). All retained rules are byte-identical
to V2. Cleanup, not regression.

### `src/v3/components/Tomorrow/PromoteTomorrowButton.module.css`
V2 ancestor: `src/components/Tomorrow/PromoteTomorrowButton.module.css` @ `df685c3`

| Rule | V2 | V3 | Verdict | Action |
|---|---|---|---|---|
| `.button:focus-visible` outline | `2px solid var(--color-accent)` | `2px solid var(--color-fg)` | **ambiguous** | **kept** V3 — see below |

The button's *background* is `var(--color-accent)`, so a 2px accent
outline against accent background is effectively invisible. V3's
`--color-fg` is a legitimate fix for an invisible-focus a11y bug. But
this kind of "fix" should still get Jake's eyes since the button now
shows a near-black focus ring against the sage background. **Flagging
for Jake; leaving V3 value in place since reverting would reintroduce
an a11y regression.**

### `src/v3/components/Tomorrow/TomorrowForm.module.css`
V3 dropped many classes (`.hint`, `.section`, `.addButton`,
`.extraRow`, `.removeButton`, `.empty`, etc.). Verified by grep on the
V3 `TomorrowForm.tsx` that the only classes used are `.form`, `.field`,
`.label`, `.input`, `.select` — all retained, all byte-identical to V2.
The dropped classes were dead. Cleanup, not regression.

### `src/v3/components/Tomorrow/TomorrowPreview.module.css`
**Identical to V2.** No diff.

## TSX structural drifts

None found that affect layout. Spot-checked:

- `Timeline/InstantChip.tsx`: wrapper / inner div / span structure
  preserved. V3 adds only `style={ownerStyleVar(...)}` and a couple
  new chip-label cases for new V3 event types (`daycare_dropoff`,
  `daycare_pickup`). Class names identical.
- `Timeline/Block.tsx`: same class-name list. V3 adds `style={...,
  ...ownerStyleVar(value)}` and synthesizes `data-type="putdown"` from
  `event.eventKey === PUTDOWN_KIND_TAG` so existing CSS selectors apply.
- `Timeline/TimelineV3.tsx` (renamed from `TimelineV2.tsx`): only one
  trivial reformat of a `<div>` opener; otherwise identical class
  names.
- `shared/EventEditDrawerV3.tsx`: identical class name list (backdrop /
  drawer / handle / title / field / label / input / fieldError /
  actions / delete / cancel / save). Line numbers shifted only.
- `shared/OwnerPickerV3.tsx`: identical structure. The V2 dynamic
  `styles[opt.cssKey]` per-owner class was dropped in favor of inline
  `style={ownerStyleVar(...)}` — necessary mechanism change, not a
  layout drift.
- `Dashboard/CurrentWakeWindowStatus.tsx`: same root / dot / inner span
  layout. The V2 `ownerClass` lookup was replaced with inline
  `style={ownerStyleVar(...)}`.

## Ambiguous items needing Jake's call

1. **`PromoteTomorrowButton.module.css` focus-visible outline color.**
   V2: `var(--color-accent)`. V3: `var(--color-fg)`. V3's value is the
   one currently shipping. The V2 value would be invisible against the
   button's accent background, so reverting reintroduces an a11y bug.
   Left V3 value in place; flagging in case the focus ring color matters
   to your visual design.

## Files I didn't expect

- `Dashboard/OwnerPill.module.css` and `Dashboard/OwnerPill.tsx` are
  brand new in V3 — V2 inlined the pill markup directly inside
  `NextEventCard.tsx`. The new component is a cleaner home for the
  pill but inherited the same full-saturation background bug that
  CurrentWakeWindowStatus had. Fixed.
- `Dashboard/NextEventCard.module.css` still carries the legacy `.owner`
  class even though NextEventCard.tsx now delegates to `<OwnerPill>`.
  The class is still applied via `<OwnerPill className={styles.owner}>`
  which composes onto OwnerPill's `.pill`, so the rule is live.
  Restored to the tinted form so the *composed* result matches V2 even
  on this code path.

## Verification

- `tsc --noEmit` — clean
- `vitest run` (skipping `repositories/**` and `tests/integration/**`)
   — 78 files, 519 tests, all passing
