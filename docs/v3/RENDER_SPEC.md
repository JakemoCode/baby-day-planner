# V3 Render Spec

Render-only rules for timeline display, the drawer, and the dashboard.
Engine rules (scheduling, lifecycle, cascade) live in
[`ENGINE_SPEC.md`](ENGINE_SPEC.md). Data model (schema, status
transitions, persistence) lives in [`DATA_MODEL.md`](DATA_MODEL.md).

Rule numbering is preserved from the original `REQUIREMENTS.md`
(archived at [`docs/_archive/v3/REQUIREMENTS_v3_legacy.md`](../
_archive/v3/REQUIREMENTS_v3_legacy.md)).

---

## §3 Nap render rules

### R3.11 Naps under 24px tall are clamped UP for tappability

Block height = `max(naturalHeightPx, 24)`. A 1-minute nap renders at
24px so the user can tap to fix it.

- **Why**: an invisible doc is worse than a slightly distorted one.
- **Edge case it prevents**: an accidental Start/End in quick succession
  creating a permanently uneditable doc.

### R3.12 Naps display inline duration when endTime is set

Block label: `"Nap 2 (42 min)"`. When `endTime` is undefined
(in-progress), label is just `"Nap 2"`.

### R3.13 Short naps collapse to single-row layout

When block height < 50px, render owner inline with the label, drop the
range row.

- **Why**: the `(N min)` suffix on the label already conveys duration.
  A separate range row at this height clips visually.

---

## §6 Putdown render rules

### R6.3 Putdown inherits its visual owner-tint from its parent

Render-only — purely a styling concern. Putdown stripe color matches
the parent nap/bedtime's owner (or unowned default).

### R6.4 Putdown renders as a single-row block

Label format: `"Putdown · {time}"` (compact short-time, e.g.
`"Putdown · 1:45p"`). Owner stripe only; no range row.

### R6.5 Putdown render uses low-contrast warm-tone stripes

Stripe pattern alternates `--color-surface-raised` and `--color-border`
(both warm cream-ish) so the label text reads cleanly on top.

### R6.6 Putdown renders ABOVE the parent wake window (z-order)

Z-order rank: `wake_window=1 < nap=2 = bedtime=2 < putdown=3 < extra=4`.

---

## §7 Bedtime render rules

### R7.12 Bedtime renders with sage-tint fill, darker stroke

Same fill family as nap (both = "baby asleep"), with stroke
`--color-fg-soft` so it reads as "deeper sleep."

---

## §10 Layout constants

### R10.4 Left-inset constants

`BLOCK_LEFT_INSET` and `BLOCK_RIGHT_INSET` define the standard left/right
padding for block events in the block lane.

### R10.5 Start/end marker lines

Block events render thin horizontal lines at their start and end times to
anchor them visually to the time axis.

---

## §16 Timeline Display

> **V3 scope note**: V3 does NOT redesign the Timeline UI. The rules
> below document the V2 timeline's current behavior so the V3 engine
> output stays compatible with the existing renderer. After V3 stabilizes,
> incidental cleanups in the timeline component (component organization,
> token cleanup) may happen, but no visual redesign is planned.

### R16.1 Three lanes: axis (left, hour labels), block lane (center), gutter (right, chips)

Layout constants: AXIS_W=36, GUTTER_W=124, total content max 640px on
desktop.

### R16.2 Vertical scale is `pxPerMin = pxPerHour / 60`

Default `pxPerHour = 120` (= 2 px/min). User-configurable 70–220 in
settings.

### R16.3 Hour ticks render at every whole hour visible in viewport

Format: `"10A"`, `"1P"` (compact, fits AXIS_W).

### R16.4 Default viewport is 7:00 AM – 9:00 PM, with 30 min padding

Events outside this range expand the viewport.

### R16.5 Putdown blocks anchor LEFT, narrower than wake windows

`leftPx = BLOCK_LEFT_INSET; rightPx = BLOCK_RIGHT_INSET +
PUTDOWN_RIGHT_EXTRA (30)` so the parent WW's text on the right stays
visible.

### R16.6 Custom blocks anchor RIGHT (sub-block under the parent WW)

`leftPx = BLOCK_LEFT_INSET + CUSTOM_LEFT_EXTRA (110)`.

### R16.7 Instant chips fan HORIZONTALLY at the same time

Concurrent instants render in one cluster row, never stack vertically.
Vertical stacking would falsely imply different times.

- **Why**: this is THE critical rule from the design handoff.

### R16.8 Wake events that coincide with WW1 start are filtered

If a `type: "wake"` event has the same `startTime` as a `wake_window`
block, drop the wake instant. (Rendering both = visual redundancy.)

### R16.9 Past events render at 0.45 opacity when `dimPast` enabled

Only on the live `/timeline` view (which has `nowMinutes`). On
`/day-templates`, `/tomorrow`, and `/history`, dimPast is hard-coded
false.

### R16.10 Now indicator: 2px line + axis-pinned time pill

Pill width = AXIS_W (so it never extends into the block lane).
Updates each minute via `useNowMinutes`.

### R16.11 Color encoding: type fills (default) or owner fills

User-toggleable via `settings.timelineColorMode`. In owner mode, the
block fill is the owner's tint; in type mode, the fill is the type
color and a 5px owner stripe appears on the left edge.

### R16.12 Block z-order: wake_window < nap = bedtime < putdown < extra

Later siblings paint over earlier; render order = sort by `zOrder()`.

### R16.13 Chip dot color encodes owner (always); chip border ring encodes recorded vs projected (V3 proposal)

V2 uses dot=type-color in type mode, dot=owner-color in owner mode.
V3 should consider always using dot=owner so the user can scan owner
distribution at a glance, regardless of color mode.

### R16.14 Chip layout: dot · label · time, with owner name as a second row

Owner name left-aligned under the time, in owner color.

### R16.15 Chip label rules

- `bottle` → event.label (preserves "Bottle 1"/"Bottle 2" ordinal)
- `pump` → "Pump"
- `bedtime` → "Bed"
- `wake` → "Wake"
- `extra` → event.label

> **Note on dream feed**: there is no `dream_feed` event type. The
> "Dream Feed" label is applied at render time by `applyDreamFeedLabel`
> (see [Dream Feed Render-Only Label](#dream-feed-render-only-label)
> below) to the first projected bottle whose `startTime >
> bedtime.startTime`. That bottle surfaces in the chip as "Dream Feed"
> via its `event.label`; no special chip-label case needed here.

### R16.16 Bottle chip border uses owner color

Chip's outer ring is owner-tinted so each bottle shows whose shift it
falls under.

### R16.17 The timeline component is shared across 4 surfaces

`/timeline`, `/day-templates`, `/tomorrow`, `/history`. Same component;
different `dimPast` and `nowMinutes` props.

---

## §17 Drawer & Form Validation

### R17.1 Drawer field visibility per event type

| Type | start | end | amount | owner | label |
|------|-------|-----|--------|-------|-------|
| nap | ✓ | ✓ | | ✓ | |
| wake_window | | | | ✓ | |
| bottle | ✓ | | ✓ | ✓ | |
| pump | ✓ | | | | |
| bedtime | ✓ | | | ✓ | |
| extra | ✓ | ✓ | | ✓ | ✓ |

> **Note**: `dream_feed` is not a drawer-editable event type. Dream feed
> bottles surface as ordinary `bottle` events in the drawer. The
> "Dream Feed" label is render-only (see
> [Dream Feed Render-Only Label](#dream-feed-render-only-label)).

### R17.2 Validation errors render as field-level helper text

`startTime` errors below the start field; `endTime` errors below the
end field. Save button disables while any error is present.

- **Why**: a bottom-of-form error is harder to associate with the
  offending input.

### R17.3 Editing `startTime` auto-fills `endTime` to preserve duration; show a helper hint

When user changes `startTime` on a duration-having event:
- If `form.startTime` and `form.endTime` are both set, preserve the
  duration: `nextEnd = nextStart + (oldEnd - oldStart)`.
- Otherwise default to `nextStart + (settings.defaultNapLengthMinutes for naps; 60 min for extras)`.

A small helper text under the End time field reads (e.g.) "Auto-adjusts
when start time changes — edit to override" so the auto-fill is
discoverable.

- **Why**: saves re-entering both fields when the user is just shifting
  the event in time. Helper text demystifies the magic.

### R17.4 Saving a drawer-edited projected event counts as a recording

`recorded` becomes true. Status becomes `"completed"`. Source becomes
`"manual"`.

### R17.5 Owner-only re-edits don't change `recorded`

If `source.recorded === true` already (a previously-recorded event being
re-edited for owner), `recorded` stays true. If `source.recorded ===
false` and only owner changed, `recorded` stays false (status:
overridden).

### R17.6 Cleared owner field is omitted, not undefined

Drawer's `formToEvent` deletes the `owner` key when the picker is set
to "no owner." `exactOptionalPropertyTypes` requires omission rather
than `undefined` for the field to actually clear.

### R17.7 Drawer error messages use AM/PM display format

Times in error messages are `"1:11 PM – 1:56 PM"`, never raw 24h.

### R17.8 Delete button only shows for `actual`/`manual` source events

Projected events can't be deleted (they're not in Firestore).

### R17.9 Buttons use terse labels; no descriptive sub-labels or subtitles

Drawer / dashboard / FAB buttons render a single short label
("Save", "Cancel", "Delete", "Start Bottle", "Start Nap N"). No
secondary text under buttons explaining what they do. The label IS
the explanation.

- **Why**: V2 occasionally bundled subtext ("Tap to record a bottle
  now") that proved redundant. Users learn the buttons quickly.
- **Edge case it prevents**: stale subtext in non-English contexts or
  drift between subtext and behavior over time.

---

## §18 Dashboard

### R18.1 "Next ordinal" computation = unique `recorded:true` eventKeys + 1

Both for naps and bottles. Counts unique keys (Start+End pair = 1).

### R18.2 Start Bottle Now creates a `recorded:true` actual

Event has `source: "actual", status: "actual", recorded: true`.

### R18.3 Start Nap creates a `recorded:true` actual; End Nap updates it

Start: no `endTime`, `status: "actual"`. End: adds `endTime`, status
becomes `"completed"`. Same `eventKey`.

### R18.4 V3 OPEN: dashboard button labels show ordinal

V2 has buttons "Start Nap Now" / "End Nap"; V3 plan (per
`DASHBOARD_BUTTON_TODO.md`) is "Start Nap N" / "End Nap M". Tracked
separately.

### R18.5 The dashboard suppresses preview cards that overlap NextEventCard

If `NextEventCard` already announces the same category (e.g. bedtime),
the bottom-of-page bedtime preview is hidden.

### R18.6 End-of-day card replaces dashboard after bedtime + no upcoming events

`isEndOfDay = !nextEvent && nowMinutes >= bedtimeThreshold`.

---

## §19 Settings (render-relevant rules only)

### R19.4 Duration inputs use `H:MM` format, persist as minutes

`<DurationInput>` accepts "1:25" or bare "85", emits 85 minutes.
Display always `H:MM`.

- **Why**: 85 min is harder to read than 1:25.

---

## Dream Feed Render-Only Label

**Helper**: `applyDreamFeedLabel(events, settings)` in
`src/v3/ui/dreamFeedLabel.ts`.

Dream feed has zero engine logic. The label is applied at render time:

1. If `settings.dreamFeedEnabled` is `false`, return `events` unchanged.
2. Find the bedtime event in the projection. If none exists, return
   `events` unchanged.
3. Among all `bottle` events whose `startTime > bedtime.startTime`,
   select the one with the smallest `startTime` (earliest-by-startTime).
4. Relabel that bottle's `label` to `"Dream Feed"`. All other
   post-bedtime bottles keep their `"Bottle N"` labels.

**Lifecycle-agnostic**: both projected and recorded bottles are
eligible. If the user recorded a real 10 PM bottle, that IS the dream
feed — relabeling applies regardless of lifecycle state.

**No engine logic**: `applyDreamFeedLabel` is called by the render
layer, not by `projectDay`. The engine never emits a `dream_feed` event
type; the `EventType` union does not include it.
