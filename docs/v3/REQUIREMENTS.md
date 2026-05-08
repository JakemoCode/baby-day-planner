# V3 Requirements — Domain Rules

> Source of truth for "what the engine and UI MUST do." Every rule below
> is either (a) extracted from V2 source, (b) ratified by Jake in a
> session, or (c) inferred from a fix commit. Each rule has a numeric
> ID — when a V3 module implements one, reference its ID in code
> comments and tests.

> **How to read this**: each rule states the rule, then **Why** (the
> reason it exists), then **Edge case it prevents** (the failure mode
> that would surface if the rule went away). Property-based tests
> should target the edge case directly.

> Reverse map: `EDGE_CASES.md` lists scenarios; this doc lists rules.
> Many edge cases enforce the same rule — that's expected.

---

## Table of Contents

- [§1 Event Data Model](#1-event-data-model)
- [§2 Event Lifecycle & Status](#2-event-lifecycle--status)
- [§3 Naps](#3-naps)
- [§4 Wake Windows](#4-wake-windows)
- [§5 Bottles](#5-bottles)
- [§6 Putdown](#6-putdown)
- [§7 Bedtime](#7-bedtime)
- [§8 Dream Feed](#8-dream-feed)
- [§9 Pumps](#9-pumps)
- [§10 Custom Events (Extras)](#10-custom-events-extras)
- [§11 Daily Recurring Events](#11-daily-recurring-events)
- [§12 Owner Inheritance](#12-owner-inheritance)
- [§13 Day Templates](#13-day-templates)
- [§14 Day Lifecycle](#14-day-lifecycle)
- [§15 Engine Pipeline Invariants](#15-engine-pipeline-invariants)
- [§16 Timeline Display](#16-timeline-display)
- [§17 Drawer & Form Validation](#17-drawer--form-validation)
- [§18 Dashboard](#18-dashboard)
- [§19 Settings](#19-settings)
- [§20 Persistence (Firestore)](#20-persistence-firestore)

---

## §1 Event Data Model

### R1.1 Every event has a stable identity composed of `(id, eventKey)`

`id` is the Firestore document id (collision-safe via `Date.now()` suffix).
`eventKey` is the semantic slot identifier (`nap_2`, `bottle_3`,
`bedtime`, `wake_window_1`, `cook_dinner`).

- **Why**: `eventKey` lets the engine match user docs against projected
  slots. Two docs with the same `eventKey` (e.g. Start Nap + End Nap)
  represent one logical event.
- **Edge case it prevents**: dashboard counter double-counting Start/End
  pairs. Without `eventKey` dedupe, Nap 1 reads as 2 nap recordings.

### R1.2 Every event has a `kind` discriminator: `"block" | "instant"`

Blocks have duration (rendered in center lane). Instants are
point-in-time (rendered in right gutter as chips).

- **Why**: layout is data-driven; the renderer never re-derives kind from
  shape.
- **Edge case it prevents**: extra events with optional endTime would
  otherwise need special-casing in 4+ render sites.

### R1.3 `kind` is deterministically derived from `(type, endTime)` for legacy docs

```
wake_window | nap | putdown | bedtime  → block
extra with endTime defined              → block
extra without endTime, plus everything else → instant
```

- **Why**: legacy Firestore docs predate the explicit field. The
  Firestore converter coerces on read so the engine never sees a missing
  `kind`.
- **Edge case it prevents**: a single legacy doc without `kind` crashes
  the renderer's discriminator switch.

### R1.4 `recorded: boolean` is the canonical "user committed this" gate

- `false`: projection from the engine OR a stale annotation
  (owner-only edit). Engine recalculates around these freely.
- `true`: user explicitly recorded — Start/End Nap, Start Bottle Now,
  FAB-create, drawer time-edit. Counters / overlap validation /
  cascade anchoring all use this gate.

- **Why**: `source` (provenance) and `status` (lifecycle stage) couldn't
  individually distinguish "annotation" from "recording." `recorded` is
  the explicit yes/no.
- **Edge case it prevents**: owner-only annotations inflating dashboard
  ordinals (the "Start Nap 4 when Nap 1 hasn't happened" bug).

### R1.5 Times are minutes-since-midnight; cross-midnight uses 24+ hours

Internal representation is integer minutes. Display strings are `"HH:MM"`
24h, with `"30:00"` meaning 6 AM next day.

- **Why**: bedtime visually extends through the night; representing this
  natively is simpler than juggling Date objects with timezones.
- **Edge case it prevents**: bedtime block clipping at midnight when it
  should carry into the empty morning.

### R1.6 `formatTimeForDisplay()` mods 1440 for human-readable AM/PM

Internal `30:00` displays as `"6:00 AM"` when shown to users.

- **Why**: users read 12h time; engine math uses unbounded minutes.
- **Edge case it prevents**: showing "30:00" or "6:00 AM next day" in
  chip labels — visually broken.

### R1.7 Owners are configurable, not hard-coded — three slots

V3 generalizes V2's hard-coded `Jake | Kelly | Daycare`. The schema
defines three semantic slots:

```ts
type OwnerSlot = 'parent1' | 'parent2' | 'other';

type OwnerConfig = {
  parent1: { displayName: string; color: ColorToken };
  parent2: { displayName: string; color: ColorToken };
  // Multiple "other" entries supported (Daycare, in-laws, babysitter, etc.)
  other: Array<{ id: string; displayName: string; color: ColorToken }>;
};
```

Stored under `Settings.owners` (or a sibling doc). Defaults:
`parent1.displayName = "Parent 1"`, `parent2.displayName = "Parent 2"`,
`other = [{ id: 'caregiver1', displayName: "Caregiver" }]`. First-run
setup screen lets the user fill in real names.

An `Owner` reference on an Event is `{ slot: OwnerSlot; otherId?: string }`
(or just a string id under the hood). The display layer resolves to a
name + color via the config.

- **Why**: the app is currently built for Jake + Kelly; if anyone else
  wants to use it, the codebase shouldn't bake in our names. Slot-based
  with display config = portable.
- **Edge case it prevents**: every reference to "Jake" / "Kelly" /
  "Daycare" in code, copy, and color tokens having to be hand-changed
  for a fork. Slots stay constant; display strings come from config.

### R1.7.1 "Other" supports multiple named entries

Daycare, in-laws, babysitter, sister, friend — each is a distinct
"other" entry with its own id and displayName. Templates and event
docs reference the id; UI looks up the name.

- **Edge case it prevents**: collapsing all non-parent caregivers into
  a single "Other" with no way to distinguish "Daycare nap" from
  "In-laws nap."

### R1.7.2 Owner config is per-child / per-account

A single Settings doc owns the slot config; multi-child support
(out of scope for V3 — see OUT_OF_SCOPE §1) would expand this.

### R1.8 An event with `recorded: true` has a permanent commitment

Once `recorded: true`, future drawer saves keep it true. Owner-only
re-edits cannot un-record.

- **Why**: a recording is a fact about the day. Annotating it shouldn't
  retroactively change whether it happened.
- **Edge case it prevents**: a user editing owner on a recorded nap
  un-recording it and breaking the dashboard counter.

---

## §2 Event Lifecycle & Status

### R2.1 The four valid statuses are `projected | actual | overridden | completed`

- `projected` — engine output, never persisted to Firestore.
- `actual` — recording in progress (Start Nap pressed, no endTime yet).
- `completed` — recording finished (End Nap, FAB-create, drawer
  time-edit on a previously projected event).
- `overridden` — owner-only annotation on a previously projected event;
  no time commitment.

### R2.2 Allowed status transitions

```
projected → actual           (Start Nap on dashboard)
projected → completed        (FAB-create OR drawer time-edit)
projected → overridden       (drawer owner-only edit)
actual    → completed        (End Nap on dashboard)
overridden → completed       (subsequent drawer time-edit)
overridden → overridden      (subsequent drawer owner-only edit)
completed → completed        (drawer re-edit; status idempotent)
```

`projected` never enters Firestore. Other transitions create OR update a
Firestore doc.

- **Why**: a state machine eliminates the "what status should this be?"
  decisions scattered across drawer/button code. V3 enforces transitions
  in a central reducer.
- **Edge case it prevents**: same event saved with `status: "actual"`
  and `recorded: false` (an impossible combo that V2 nearly produced).

### R2.3 `recorded` is a derived view of status

`recorded === true` iff `status ∈ {actual, completed}` OR the doc was
created by the dashboard buttons (`source: "actual"`).
`overridden` and `projected` events have `recorded === false`.

- **Why**: in V2, `recorded` was added as an explicit field because
  `status`/`source` together couldn't always answer the question. In V3,
  with a clean state machine, `recorded` is a computed predicate, not a
  stored field.
- **Edge case it prevents**: `recorded`/`status` mismatch in a Firestore
  doc, forcing reconciliation logic.

### R2.4 Source values: `"actual" | "projected" | "manual" | "template"`

- `actual` — dashboard button-created.
- `projected` — engine output.
- `manual` — drawer or FAB created.
- `template` — legacy; not used in V2; V3 may drop entirely.

V3 collapses to `{actual, projected, manual}` if `template` is
confirmed unused.

---

## §3 Naps

### R3.1 The day's projected nap chain comes from `settings.wakeWindowsMinutes`

The settings array `[ww1, ww2, ww3, ww4]` produces N wake windows and N
naps. The wake_window_N event lasts `ww[N-1]` minutes; nap_N follows
immediately.

- **Why**: parents tune wake windows by index based on the baby's age.
- **Edge case it prevents**: changing settings.defaultNapLengthMinutes
  not propagating to projection (each nap uses defaultNapLengthMinutes
  for its end time).

### R3.2 Each projected nap defaults to `defaultNapLengthMinutes`

Unless an actual nap with a recorded `endTime` exists, projected naps
end at `start + defaultNapLengthMinutes`.

### R3.3 Recorded naps pin times exactly; unrecorded annotations don't

A nap with `recorded: true` commits its `startTime` and `endTime`. The
engine cascades subsequent events from this anchor.

A nap with `recorded: false` (e.g. owner-only annotation) carries its
owner forward but lets the cascade compute times.

- **Why**: an unrecorded annotation is a hint about the future, not a
  fact about the past. Cascade has to be free to recompute.
- **Edge case it prevents**: assigning an owner to projected Nap 3
  pinning Nap 3's stale projected time, even when Nap 2's actual shifts
  the cascade.

### R3.4 Wake window ends exactly at the next nap's start

For each (WW_N, Nap_N) pair, `ww_N.endTime === nap_N.startTime`. Always.

- **Why**: visual continuity. Any gap reads as "a slice of unstructured
  time" which doesn't exist in this model.
- **Edge case it prevents**: bedtime putdown chip floating between WW
  end and bedtime start.

### R3.5 Wake window stretches OR shrinks to actual nap start

If actual `nap_N.startTime > projected ww_N.endTime`, stretch ww forward.
If actual `nap_N.startTime < projected ww_N.endTime`, shrink ww back.
Always clamp `ww.endTime = nap_N.startTime`.

- **Why**: nap_N's time is the truth; ww_N is "everything before."
- **Edge case it prevents**: nap recorded later than projected leaving
  visual gap (R3.4). Nap recorded earlier than projected leaving
  visible overlap (the bug Jake hit).

### R3.6 Inverted nap data collapses the wake window to zero

If actual `nap_N.startTime < cursor` (cursor = previous nap's
endTime), clamp `ww_N.endTime = cursor` so the WW is zero-length
rather than rendering inverted.

- **Why**: defensive. User-edited times can be inconsistent; the engine
  must stay monotonic visually.
- **Edge case it prevents**: timeline rendering a wake window with
  `start > end`, which causes negative-height blocks.

### R3.7 Short-nap adjustment shortens the FOLLOWING wake window

If `prevNapActual.recorded === true` AND `(prevNapActual.endTime -
prevNapActual.startTime) < settings.shortNapThresholdMinutes`, then
`ww_N+1` length = `(default ww length) -
settings.shortNapAdjustmentMinutes`.

- **Why**: babies who nap short typically need a shorter wake window
  next.
- **Edge case it prevents**: an owner-only annotated nap (recorded=false)
  triggering the adjustment based on its stale projected duration.

### R3.8 Short-nap adjustment ONLY applies if previous nap was recorded

Unrecorded annotations have no real duration to learn from.

- **Why**: see R3.3 — annotations carry intent, not measurement.
- **Edge case it prevents**: phantom adjustment cascading off a stale
  projected duration.

### R3.9 Naps that overlap RECORDED naps are blocked at the drawer

Drawer validation rejects a save if the new (start, end) range overlaps
any other nap with `recorded === true`. Projected and `recorded: false`
naps don't block — they get recalculated by the engine.

- **Why**: prevents user from accidentally double-booking actual naps
  while letting them displace projections.
- **Edge case it prevents**: blocking "I'm recording Nap 2 at 1pm" just
  because projected Nap 3 also lives at 1pm.

### R3.10 Nap cannot have `endTime <= startTime`

Drawer validation blocks save with a field-level error message.

- **Why**: zero-length and inverted ranges aren't useful. The dashboard
  5-min confirm guard handles "ended too soon" before this check.
- **Edge case it prevents**: persisting nap_3 with start=10:00, end=9:30
  which the renderer can't draw.

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

## §4 Wake Windows

### R4.1 Wake window owner is set by template OR manual edit; no auto-inheritance

V3 reverses V2's "WW N inherits from Nap N" convention. Wake windows
get an owner ONLY when:
1. A template specifies `wakeWindowOwners[N-1]`, OR
2. The user explicitly assigns one via the drawer or
   /day-templates picker.

If neither, the wake window has no owner (renders without an owner
stripe).

- **Why**: V2's auto-inheritance was a Jake-Kelly-life-pattern
  convention, not a universal truth. (E.g., Daycare runs Nap 2 but a
  parent supervised the wake window leading up to drop-off.) Encoding
  it in the engine made the data lose information.
- **Edge case it prevents**: WW2 silently labeled with Daycare's color
  because Nap 2 happened at Daycare, even though a parent was on duty
  during WW2.

### R4.2 Manual wake_window override carries metadata, NOT time

When user edits a projected WW (e.g. to set owner) via drawer, the
saved doc's `startTime` and `endTime` are NOT used by the engine. The
override only contributes `owner`, `label`, `source`, `status`. Times
stay cascade-driven.

- **Why**: a stored time becomes stale the moment another event shifts
  the cascade. Persisting time in WW overrides re-cements stale data.
- **Edge case it prevents**: WW2 stuck at 11:33 PM because that was the
  projected time when the user edited owner three days ago.

### R4.3 First wake window starts at `day.wakeTime`

WW1's startTime = the wake event's startTime = `day.wakeTime`.

- **Why**: morning anchor. Without `day.wakeTime`, no projection runs.

### R4.4 Wake window N uses `settings.wakeWindowsMinutes[N-1]` as base duration

Subject to short-nap adjustment (R3.7) and cascade clamping (R3.5, R3.6).

---

## §5 Bottles

### R5.1 Bottles cascade from the LATEST-by-time recorded bottle

`projectBottleChain` finds the latest `recorded: true` bottle (by
`startTime`), uses it as the cursor, and projects forward at intervals
determined by `intervalForAmount(amountOz, settings.bottleRules)`.

- **Why**: real bottle times feed the projection of subsequent ones.
- **Edge case it prevents**: chain always restarting from the first
  bottle of the day (= projection always shows old times).

### R5.2 Bottle interval is matched by the narrowest amount range

`bottleRules` is a list of `{minOz, maxOz?, intervalMinutes}`. The
matching rule is the one with the smallest range that contains the
bottle's amount. Open-ended rules (no `maxOz`) are lowest priority.

- **Why**: parents can write `5–6 oz → 165 min` AND `6+ oz → 180 min`
  and the more specific 5–6 wins.
- **Edge case it prevents**: a 5.5oz bottle picking up the 6+ rule
  because it sorts later.

### R5.3 Bottle eventKey index is `MAX(existing keys) + 1`, not `latest-by-time + 1`

If existing actuals have `bottle_1, bottle_2, bottle_4` (data drift —
e.g., a stray manual override at noon and a `bottle_3` recorded at
3pm), the next projected bottle is `bottle_5`, not `bottle_3` or
`bottle_5` based on time alone.

- **Why**: avoids generating duplicate `bottle_4` (the bug Jake hit).
- **Edge case it prevents**: two `bottle_4` docs at different times,
  both showing up on the timeline.

### R5.4 Bottles are renumbered chronologically for display

After all bottle logic (cascade, overlap resolution, suppression), the
engine sorts remaining bottles by `startTime` and rewrites their
`eventKey` and `label` to `bottle_N` and `"Bottle N"` where N is the
chronological position.

- **Why**: users always see Bottle 1 = earliest, Bottle 2 = next, etc.
- **Edge case it prevents**: timeline showing `Bottle 4 → Bottle 3 →
  Bottle 5` due to non-monotonic eventKeys (the second bug Jake hit).

### R5.5 Renumbering is engine-side only; Firestore eventKeys don't change

The renumber rewrites the in-memory event list. Firestore docs keep
their original eventKey. Lookups by `id` stay intact.

- **Why**: changing eventKey in Firestore would break references and
  audit history.

### R5.6 Bottle inside a nap moves to the nearer nap edge

If a projected bottle's startTime is strictly between a nap's start
and end, move the bottle to the closer edge. If the closer edge is in
the past (`< nowMinutes`), move to the far edge instead.

- **Why**: "no bottles in the middle of naps" — Jake's gospel rule.
- **Edge case it prevents**: parent attempts to bottle-feed a sleeping
  baby because the projection said so.

### R5.7 Bottle overlap resolution iterates to a fixed point

Moving one bottle to a nap edge can cascade subsequent bottles forward;
those new times might overlap a different nap. Loop until no
adjustments occur in a pass, bounded by `MAX_PASSES = 8`.

- **Why**: single-pass logic missed second-order overlaps.
- **Edge case it prevents**: Bottle 4 moved out of Nap 2 lands inside
  Nap 3.

### R5.8 Bottle chain suppression is governed by an explicit cap, not bedtime

V2 hard-suppressed projected bottles past `bedtimeThreshold`. V3 uses
an explicit setting:

```ts
Settings.bottleChain = {
  // Maximum number of bottles to project per day. Default 6 for an
  // older infant; set higher for newborns who eat 8+ times/day.
  maxBottlesPerDay: number;
  // Latest projected start time. Default bedtime-equivalent for
  // sleep-through-the-night kids; later (or 24:00) for kids who
  // genuinely feed multiple times overnight.
  latestProjectedStart: TimeMin;
};
```

- **Why**: Aden currently sleeps through ~80% of nights but
  occasionally feeds at 2–4 AM. Hard-coding "no bottles past 19:00"
  makes the engine wrong for those nights, AND wrong for younger
  infants who eat 8+ times/day.
- **Edge case it prevents**: dream feed projecting at 21:30 then NO
  more bottles because suppression cuts in. With overnight enabled,
  cascade continues to project at intervals through the night.

### R5.9 Recorded bottles past the suppression cap are always kept

If the user manually logs a bottle at 03:00, it persists regardless of
`latestProjectedStart`.

### R5.10 First bottle of the day is NOT auto-anchored to wake time

V2 had ambiguous handling here. V3 explicit: the first bottle of the
day is created when the user taps **Start Bottle Now** (or via FAB).
No projected bottle exists before the first recording. Subsequent
bottles cascade from that anchor per R5.1.

- **Why**: the first feed timing varies; tying it to wake time
  produced a false projection that confused users.
- **Edge case it prevents**: dashboard showing "Bottle 1 at 7:30 AM"
  before the user has actually fed the baby, then renumbering happening
  when the real first bottle is logged at 8:15.

### R5.12 Bottle chain has a hard upper bound to prevent infinite emission

Even with overnight enabled, projection stops at
`Settings.bottleChain.maxBottlesPerDay` per day (default 6, configurable).
This is a safety cap, not a usage cap.

### R5.13 Recorded bottles within `minBottleIntervalMinutes` of the previous trigger a confirm

When user taps "Start Bottle Now" and the last bottle was logged less
than `minBottleIntervalMinutes` (default 20) ago, show a confirm
dialog before recording. Default applies if the setting is missing.

- **Why**: protects against accidental double-tap.

---

## §6 Putdown

### R6.1 Every nap and bedtime emits a putdown event

Putdown duration = `settings.putdownLeadMinutes` (default 15).
Putdown ends exactly at the nap or bedtime's start time.

- **Why**: putdown is the visual "transition zone" (last 15 min of the
  preceding wake window).
- **Edge case it prevents**: wake window ending abruptly at nap start
  with no transition cue.

### R6.2 Putdown emits regardless of nap source

Recorded, manual, projected — all naps get a putdown. Even owner-only
annotated naps get a putdown.

- **Why**: an owner edit shouldn't erase the visual transition cue.
- **Edge case it prevents**: putdown vanishing when user assigns an
  owner via /timeline drawer (the bug Jake hit).

### R6.3 Putdown inherits owner from its parent (nap or bedtime)

`nap_N_putdown` gets `napOwners[N-1]`. `bedtime_putdown` gets
`bedtimeOwner ?? lastNapOwner`.

- **Why**: same caregiver does the putdown as the nap/bedtime itself.

### R6.4 Putdown blocks render with single-row layout (no range row)

Putdown labels are `"Putdown · {time}"` (compact short-time). Owner
appended inline. Range row is dropped.

- **Why**: putdown blocks are ~30px tall (15 min × 2px/min); two-row
  text doesn't fit.
- **Edge case it prevents**: range row clipping or overlapping the
  next nap's title.

### R6.5 Putdown skips MIN_BLOCK_HEIGHT clamp

Putdown blocks render at their natural height (no 24px floor).

- **Why**: the clamp would push 30px putdowns to 24px, and they'd
  overlap the following nap.
- **Edge case it prevents**: 2px overlap with next nap from min-height
  padding.

### R6.6 Putdown renders ABOVE the parent wake window (z-order)

Z-order rank: `wake_window=1 < nap=2 = bedtime=2 < putdown=3 < extra=4`.

Same-zOrder events render in DOM order; layout ensures putdowns paint
last among their siblings.

### R6.7 Putdown stripes use low-contrast warm tones

Stripe pattern alternates `--color-surface-raised` and `--color-border`
(both warm cream-ish) so the label text reads cleanly on top.

- **Why**: high-contrast stripes (e.g. cream + sage) compete with text.
- **Edge case it prevents**: putdown label illegible against busy stripes.

---

## §7 Bedtime

### R7.1 Bedtime is a `kind: "block"` event whose endTime defaults to `settings.defaultWakeTime` (next day)

V3 introduces `Settings.defaultWakeTime: TimeMin`. Bedtime's default
`endTime` = `defaultWakeTime + 24*60` minutes (i.e. tomorrow morning's
expected wake). For Aden's typical 7 AM wake, bedtime extends to
`31*60 = "31:00"`.

Manual bedtime + manual wake-time-tomorrow can override individually.

- **Why**: V2 hardcoded `"30:00"` (= 6 AM next day) which was a
  reasonable default but not parameterized. Tying it to
  `defaultWakeTime` makes the engine self-consistent and respects the
  parents' actual rhythm.
- **Edge case it prevents**: family with 8 AM wake schedule getting
  the bedtime block end 2 hours before their actual morning wake.

### R7.2 Manual bedtime override replaces the projected bedtime

If actuals contain a bedtime with `source ∈ {actual, manual}`, that
event becomes canonical. The projected (threshold-based) bedtime is
ignored.

### R7.3 Manual bedtime without endTime gets `"30:00"` backfilled

Users tap a time, not a range. Engine fills `endTime` so the block
extends through the night.

### R7.4 Naps starting at or after bedtime are dropped

Any nap with `startTime >= bedtime.startTime` is removed from the event
list.

### R7.5 Naps that cross bedtime are dropped entirely (not clipped)

If a nap's `startTime < bedtime` but `endTime > bedtime`, drop the
whole nap. Don't show a 5-minute sliver before sleep.

### R7.6 Bedtime starts at the END of the preceding wake window — don't shorten the WW for bedtime

V2 had `bedtimeThreshold` clip the preceding WW to fit. V3 reverses
this: the WW preceding bedtime ends at its NATURAL cascade time, and
bedtime starts there. The WW is not shortened just because bedtime
"should" be at a configured threshold.

The `bedtimeThreshold` setting becomes a **trigger**, not a cap: if
the cascade reaches a state where the next nap would start at/after
bedtimeThreshold, that nap is replaced by bedtime starting at the
WW's natural end.

- **Why**: the baby's actual wake window is what determines when
  bedtime can start. Forcing bedtime to a fixed clock time (and
  clipping the wake window to fit) creates impossible schedules — the
  baby has 30 minutes of wake time after a short nap, then "must" go
  to bed.
- **Edge case it prevents**: WW4 truncated from 1:30 to 0:45 because
  the engine wanted bedtime at exactly 19:00.

### R7.7 Wake windows starting at or after bedtime are dropped

`ww.startTime >= bedtime` → remove.

### R7.8 Wake window leading into a dropped nap stretches to bedtime

If `nap_N` is dropped due to bedtime, `ww_N.endTime` is stretched to
`bedtime.startTime`.

- **Why**: closes the visual gap between WW end and the bedtime
  putdown chip.
- **Edge case it prevents**: the "bedtime putdown floating in space
  with WW4 ending at 5:00" symptom.

### R7.9 Bedtime threshold default = `"19:00"` (settings)

User can edit; affects when the projected bedtime substitutes for the
late nap.

### R7.10 Projected bedtime takes the substituted nap's `startTime`

When the engine replaces nap_N with bedtime (because nap_N starts >=
threshold), `bedtime.startTime = nap_N.startTime`.

### R7.11 Bedtime renders with sage-tint fill, darker stroke

Same fill family as nap (both = "baby asleep"), with stroke
`--color-fg-soft` so it reads as "deeper sleep."

---

## §8 Dream Feed

### R8.0 Dream feed coexists with overnight bottles

Dream feed is one specific projected event between bedtime and
tomorrow's wake. It does NOT suppress other bottles in that window.
If `Settings.bottleChain.latestProjectedStart` extends overnight AND
the bottle interval would emit additional bottles between dream feed
and morning wake, those bottles project normally.

- **Why**: real-world overlap. A baby may have dream feed at 22:00
  AND a 03:00 bottle the same night. The engine projects both.
- **Edge case it prevents**: dream feed silently swallowing all other
  overnight bottle slots.

### R8.1 Dream feed only emits if `settings.dreamFeed.enabled === true`

When disabled, no dream feed event is added regardless of bedtime.

### R8.2 Dream feed requires a bedtime event to exist

Dream feed is computed relative to bedtime; if no bedtime, no dream
feed.

### R8.3 Dream feed time = `clamp(max(bedtime + minMinutes, earliestTime), earliestTime, latestTime)`

Specifically:
1. Earliest allowed = `max(bedtime + minMinutesAfterBedtime,
   settings.dreamFeed.earliestTime)`.
2. Final = `min(earliestAllowed, settings.dreamFeed.latestTime)`.

### R8.4 Manual dream feed override replaces the projection entirely

If `actuals` contains a dream_feed with `source ∈ {manual, actual}`,
use it as-is. Projection is skipped.

- **Why**: user-set time + owner must persist.
- **Edge case it prevents**: dream feed owner edits getting wiped on
  next projection (the bug Jake hit).

### R8.5 Dream feed is a `kind: "instant"` chip in the gutter

No duration. Renders with pump-style chip (same dot color).

### R8.6 Dream feed chip label is `"Dream Feed"` (not collapsed to "Pump")

Even though styling matches pump, the label is distinct.

- **Edge case it prevents**: user mistaking the dream feed for a regular pump.

### R8.7 Dream feed is owner-assignable via drawer

Dream feed is part of the drawer's `showOwner` set so users can pick a
caregiver.

### R8.8 Dream feed owner defaults to the OPPOSITE of the bedtime owner

If bedtime owner is `parent1`, dream feed owner defaults to `parent2`,
and vice versa. If bedtime owner is `other` (e.g. babysitter sleepover
— rare), dream feed has no default owner; user assigns manually.

- **Why**: the bedtime parent has just gone to sleep; the other parent
  is still up and naturally handles the dream feed.
- **Edge case it prevents**: same person doing back-to-back bedtime +
  dream feed defaults that nobody actually does in practice.

### R8.9 Dream feed owner is editable via drawer

Manual override always wins over the opposite-of-bedtime default.

---

## §9 Pumps

### R9.1 Pumps are emitted from `settings.pumpTimes`

Each entry is `"HH:MM"`; engine emits a projected pump at each time
unless an actual pump already exists for that eventKey.

### R9.2 Pump eventKey is `pump_${HH:MM}`

The time is encoded in the key so dedupe works (R9.4).

### R9.3 First pump of the day anchors to `day.wakeTime`

Override: if `day.wakeTime` is set AND there's at least one entry in
`settings.pumpTimes`, the first entry is replaced with `day.wakeTime`.

- **Why**: nursing parents pump first thing in the morning; settings
  shouldn't have to track day-by-day variation in wake time.

### R9.4 Actual pump replaces projected at the same eventKey

If an actual pump exists with eventKey `pump_07:00`, no projected pump
is emitted at that key.

### R9.5 Pumps are `kind: "instant"` chips

No duration. Standard chip render.

---

## §10 Custom Events (Extras)

### R10.1 Extras can be EITHER `kind: "block"` (with endTime) OR `kind: "instant"` (without)

`deriveKind` discriminates by `endTime` presence.

### R10.2 Extras carry user-defined labels

Chip / block label = `event.label`, not a type-derived string.

### R10.3 Extras can be created from any page; they always live on `/timeline`

The FAB is available on any authed page (dashboard, /timeline,
/tomorrow, /day-templates, /history). Tapping the FAB → type picker
→ drawer. The created event is associated with the active day and
appears on `/timeline`.

- **Why**: users should be able to log "Pediatrician at 11" from
  wherever they happen to be in the app.
- **Edge case it prevents**: forcing the user to navigate to /timeline
  before logging a one-off event.

### R10.4 Custom blocks (with endTime) anchor RIGHT in the center lane

Sub-block with `leftPx = BLOCK_LEFT_INSET + CUSTOM_LEFT_EXTRA (110px)`
so they don't overlap the parent wake window's title.

### R10.5 Custom blocks have 1px start/end marker lines

Thin horizontal lines extending past the block's left/right edges to
make start/end times unambiguous. (The block doesn't span a "natural"
boundary like wake/nap do.)

### R10.6 Custom event owners are assignable via drawer

`showOwner` includes "extra".

---

## §11 Daily Recurring Events

V3 generalizes V2's Cook Dinner into a list of user-defined recurring
events. Each entry has a label, time, optional default owner, and
optional duration.

### R11.1 Settings holds a list of recurring event templates

```ts
Settings.dailyRecurring: Array<{
  id: string;                    // stable internal id
  label: string;                 // "Cook Dinner", "Daycare Dropoff", "Pediatrician"
  time: TimeMin;                 // start time
  durationMinutes?: number;      // present → block; absent → instant
  defaultOwnerSlot?: OwnerSlot;  // "parent1" / "parent2" / "other:caregiver1"
  enabled: boolean;
}>;
```

### R11.2 Each enabled entry emits one projected event per day

The engine emits one event per enabled recurring template, with
`eventKey = "recurring:{id}"`. If duration is set, kind = "block";
otherwise kind = "instant".

### R11.3 Recurring events follow the standard "extra" rules

Same drawer behavior, same chip/block rendering, same overlap and
validation rules as user-created extras.

### R11.4 Multiple recurring events of any combination are supported

Examples a user might configure:
- "Cook Dinner" — instant at 17:00
- "Daycare Dropoff" — instant at 08:30, owner = parent1
- "Daycare Pickup" — instant at 17:30, owner = parent2
- "Bath" — block 18:30–18:45, no default owner
- "Pediatrician (Tuesdays)" — *out of scope for V3* — see §31 in
  OUT_OF_SCOPE for "weekly recurring" as a v4+ candidate

### R11.5 If a manual extra exists with eventKey `recurring:{id}` for the day, no duplicate projection

The engine checks for an existing matching key before emitting.

### R11.6 Per-day suppression: `Day.suppressedRecurringIds: string[]`

If the recurring template's id is in the active day's suppression list,
no projected event emits for that day. The user "skip today" button
adds the id; toggle off removes it.

- **Why**: family is out of town tonight, no need to cook dinner
  → tap "skip" on today's chip → dinner doesn't appear today,
  reappears tomorrow.

### R11.7 Defaults: empty list

V3 ships with `Settings.dailyRecurring = []`. Users opt in by adding
entries via Settings. Migration: any V2 doc with
`settings.cookDinner.enabled = true` is converted to a single
`dailyRecurring` entry on read.

---

## §12 Owner Inheritance

V3's owner-resolution model is **explicit, not heuristic**. An event
gets an owner from one of:
1. **Manual user assignment** (drawer, /day-templates picker, or
   dashboard button creating a recording) — wins always.
2. **Template** — when the day has an `ownershipTemplateId` and the
   template specifies an owner for this event's slot.
3. **Default rule** — for two specific cases (putdown, dream feed).
4. **No owner** (renders without an owner stripe / dot tint).

### R12.1 Manual / recorded events keep their owner forever

If an event has `source ∈ {actual, manual}` AND a non-empty owner
field, no template override applies.

If the user explicitly cleared owner (the field is omitted), the
template still does NOT re-stamp — clearing is treated as a deliberate
choice. (See R12.7.)

- **Why**: user intent always wins.
- **Edge case it prevents**: template silently overwriting a cleared
  owner on every render.

### R12.2 Projected naps inherit owner from the day's template, indexed by nap number

In English: when today is configured to use a particular template
(e.g. "Saturday template"), and that template specifies who's on duty
for nap 1, nap 2, etc., the projected nap docs render with those
owners. If no template is set, projected naps have NO default owner —
they render unassigned until the user explicitly picks one.

Schema:
```ts
OwnershipTemplate.napOwners: OwnerRef[];  // index 0 = nap 1
```

### R12.3 Projected wake windows inherit owner ONLY from the template, NOT from naps

V3 reverses V2. Wake windows do not auto-inherit from same-index naps.
A template can specify `wakeWindowOwners[N-1]`; if absent, the wake
window has no owner.

V3 does NOT keep V2's `napOwners[i]` fallback for wake windows.

- **Why**: see R4.1.
- **Edge case it prevents**: WW2 owner silently changing because Nap 2
  was reassigned to Daycare.

### R12.4 Projected putdowns inherit from their parent event's owner

`nap_N_putdown` resolves to nap_N's owner (regardless of whether nap_N
got that owner from manual assignment, template, or anywhere else).
`bedtime_putdown` resolves to bedtime's owner.

- **Why**: the person putting baby down is, by definition, the same
  person attached to the parent event. This is a structural
  relationship, not a template lookup.
- **Edge case it prevents**: putdown chip rendering with a different
  owner color than its nap.

### R12.5 Projected bedtime inherits from `template.bedtimeOwner` if set

Templates have an explicit `bedtimeOwner` field. No fallback to
"last nap owner" — V3 makes this explicit. If the template doesn't
specify, bedtime has no default owner.

### R12.6 Projected bottles inherit owner from the template's bottle list, by index

In English: when a template is set and it includes a list of bottle
owners (e.g. "Bottle 1 = parent1, Bottle 2 = parent2"), each
projected bottle N gets the owner at index N-1. If the template lacks
a bottle owner list, projected bottles have no default owner.

Schema:
```ts
OwnershipTemplate.bottleOwners?: OwnerRef[];  // index 0 = bottle 1
```

### R12.7 Owner can be cleared explicitly (drawer "no owner" → field omitted)

When the user picks "no owner," the saved doc has the `owner` field
absent (not set to `undefined`). This is the explicit "clear" signal.

- **Edge case it prevents**: template treating empty-but-present
  owner field as a defaulting opportunity.

### R12.8 Pump owner defaults to a specific configured slot; dream feed defaults to opposite of bedtime

- **Pumps**: every pump's default owner is `Settings.pumpOwnerSlot`.
  V3 default = `parent2` (per Jake: pumping is Kelly's domain in his
  setup; configurable for other families).
- **Dream feed**: see R8.8 — opposite of bedtime owner.

These two are the ONLY events with rule-derived (vs. template-derived)
default owners.

### R12.9 No template inheritance for: wake events, extras (manual), dailyRecurring (uses its own default)

- Wake instant events are filtered out when they coincide with WW1
  (R16.8); no owner needed.
- User-created extras carry whatever owner the user picked (or none).
- Recurring events use their per-template `defaultOwnerSlot`.

---

## §13 Day Templates

### R13.1 Templates are user-named and unbounded in count

Each template has a `displayName` (e.g. "Weekday Daycare", "Weekend
Saturday", "Sick day", "Grandparents visiting"). No hard cap on how
many templates a user can save; V3 ships with two seeds (Saturday,
Sunday) but the UI lets the user create / rename / delete freely.

```ts
OwnershipTemplate = {
  id: string;                // stable
  displayName: string;       // user-editable
  napOwners: OwnerRef[];
  wakeWindowOwners: OwnerRef[];
  bottleOwners?: OwnerRef[];
  bedtimeOwner?: OwnerRef;
};
```

### R13.2 A Day references at most one template via `day.ownershipTemplateId`

Mid-day swaps are out of scope (see OUT_OF_SCOPE §10).

### R13.3 Templates can be cloned and edited as a starting point

UI offers "Duplicate this template" so users can create variations
without retyping every owner.

### R13.4 `flipTemplate` swaps `parent1 ↔ parent2`, leaves `other` slots alone

Used for "alternating weekend" patterns. Now generalized for the
configurable owner system (R1.7).

### R13.5 Templates can be assigned for a future day via /tomorrow

The /tomorrow page lets the user pick which template the next-day
projection should use. Persists as `day.ownershipTemplateId` on the
new Day record when "Start New Day" runs (or, if the new Day already
exists in `planned` status, updates that doc).

### R13.6 Assignable event types via /day-templates picker: `{nap, wake_window, bottle, bedtime, dailyRecurring}`

The picker UI surfaces the owner-pick interaction for each of these.
Pumps and dream feed don't use the picker (R12.8 handles them via
explicit Settings).

### R13.7 The /day-templates page projects against a synthetic day

Hardcoded day + wake time + a seed bottle to drive the engine so the
user sees a representative shape. Synthetic day is never saved.

### R13.8 Optional: "Copy from yesterday" or "Alternate from yesterday" shortcuts

When creating a new template (or assigning one to tomorrow), the UI
should offer:
- **Copy from yesterday**: same template the active/previous day used.
- **Alternate from yesterday**: yesterday's template flipped via
  `flipTemplate`.

This addresses the natural "we did Saturday today, want Sunday-pattern
tomorrow" rhythm without forcing the user to manually pick.

- **Why**: real-world weekends often alternate; baking shortcuts in
  saves clicks.

---

## §14 Day Lifecycle

### R14.1 Exactly one Day has `status: "active"` at any time

`startNewDay` archives the previous active day in the same Firestore
transaction as creating the new one.

### R14.2 Day lifecycle states: `planned | active | archived`

- `planned` — not currently used by V2 dashboard; reserved.
- `active` — today's day; dashboard shows it.
- `archived` — prior days; surfaced on /history.

### R14.3 A day without `wakeTime` can't project

Engine returns empty events. Dashboard shows the "Start New Day" prompt.

### R14.4 "Start New Day" action sets `wakeTime` to the current local time

When invoked, the new Day record's `wakeTime = now()`. User can edit
later via the Day-detail / Settings flow.

### R14.4.1 The "Start New Day" UI surface is contextual, not always-shown

V2 hardcoded a Start-New-Day button on the dashboard whenever the
active day was missing `wakeTime`. V3 makes this a contextual action
that only appears when it's the genuinely-correct next step
(end-of-yesterday, no active day yet, after midnight, etc.). When the
day is in motion, that screen real estate is used for live status.

The UX of WHEN to show the action is open in V3 — likely surfaces:
- End-of-day card on dashboard ("Tomorrow's plan?")
- A persistent header action only when no active day exists
- Settings or /tomorrow page

Tracked as a V3 design decision; not finalized.

### R14.5 Each Day owns its own events collection

Events are nested under `days/{dayId}/events/{eventId}`. Archiving a
day doesn't move events; queries by dayId still work.

### R14.6 Bedtime extends visually past midnight; events past 24:00 belong to "today"

A bedtime event at `19:00` with endTime `"30:00"` displays as part of
today's timeline. The next day starts when "Start New Day" is tapped
(typically next morning).

---

## §15 Engine Pipeline Invariants

### R15.1 The pipeline is order-dependent; V3 must enforce or eliminate the order

V2 pipeline order:
1. `projectNapChain`
2. `applyNapActuals`
3. `applyWakeWindowOverrides`  ← **must run after step 2** (cascade
   times must exist before metadata merge)
4. `applyBedtime`              ← **must run after step 3** (so bedtime
   sees final WW shape)
5. `addPutdownEvents`          ← **must run after step 4** (knows which
   naps survive bedtime)
6. `projectBottleChain`
7. `resolveBottleNapOverlap`   ← **must run after step 5** (knows all
   nap times)
8. `suppressBottlesAfterBedtime`
9. `renumberBottles`           ← **must run after step 8**
10. `addDreamFeed`             ← **must run after step 4** (needs
    bedtime)
11. `mergePumpsAndExtras`
12. `applyTemplate`            ← **must run last** (sees final shape)

V3 should encode these dependencies as data, not implicit ordering. A
rules engine derives the order from declared dependencies.

### R15.2 The output is sorted by `startTime` ascending

Final result of `projectDay` is sorted before return.

### R15.3 The pipeline is pure: same `(day, settings, actuals, template,
nowMinutes)` produces same output

No randomness, no Date.now() inside, no I/O.

### R15.4 `nowMinutes` defaults to `24*60` when not provided

End of day. Used for bottle overlap "is closer edge in past" check.

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

### R16.13 Chip dot color encodes owner (always); chip border ring
encodes recorded vs projected (V3 proposal)

V2 uses dot=type-color in type mode, dot=owner-color in owner mode.
V3 should consider always using dot=owner so the user can scan owner
distribution at a glance, regardless of color mode.

### R16.14 Chip layout: dot · label · time, with owner name as a second row

Owner name left-aligned under the time, in owner color.

### R16.15 Chip label rules
- `bottle` → event.label (preserves "Bottle 1"/"Bottle 2" ordinal)
- `pump` → "Pump"
- `dream_feed` → "Dream Feed"
- `bedtime` → "Bed"
- `wake` → "Wake"
- `extra` → event.label

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
| dream_feed | ✓ | | ✓ | ✓ | |
| extra | ✓ | ✓ | | ✓ | ✓ |

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

## §19 Settings

### R19.1 Settings doc per child

Path: `children/{childId}/settings/main` or similar. V3 should confirm
whether multi-child is in scope (probably not, per OUT_OF_SCOPE).

### R19.2 First-run uses `defaultSettings(childId)`

The Settings page renders against defaults if no doc exists; first save
creates the doc.

### R19.3 Default values (V3 schema; some are renamed/added vs V2)

Existing fields:
- `defaultBottleAmountOz`: 5
- `defaultBottleIntervalMinutes`: 180
- `defaultNapLengthMinutes`: 60
- `putdownLeadMinutes`: 15
- `bedtimeThreshold`: "19:00" (now a *trigger*, not a clip — see R7.6)
- `shortNapThresholdMinutes`: 35
- `shortNapAdjustmentMinutes`: 10
- `wakeWindowsMinutes`: [120, 135, 135, 150]
- `bottleRules`: [{0–5.5 → 150}, {5.6+ → 180}]
- `dreamFeed`: enabled, 20:30–21:00, +90min after bedtime
- `pumpTimes`: ["10:30", "14:30"]
- `minBottleIntervalMinutes`: 20
- `timelineColorMode`: "type"
- `timelinePxPerHour`: 120
- `timelineDimPast`: true

V3 additions:
- `defaultWakeTime`: "07:00" (drives bedtime endTime — R7.1)
- `bottleChain`: { maxBottlesPerDay: 6, latestProjectedStart: "20:00" }
  (overnight bottles configurable — R5.8)
- `pumpOwnerSlot`: "parent2" (drives pump owner default — R12.8)
- `dailyRecurring`: [] (replaces `cookDinner` — R11)
- `owners`: { parent1: {displayName, color}, parent2: {...},
   other: [...] } (configurable owner slots — R1.7)

V3 removed:
- `cookDinner` (subsumed by `dailyRecurring`; migrated on read)

### R19.4 Duration inputs use `H:MM` format, persist as minutes

`<DurationInput>` accepts "1:25" or bare "85", emits 85 minutes.
Display always `H:MM`.

- **Why**: 85 min is harder to read than 1:25.

---

## §20 Persistence (Firestore)

### R20.1 All mutations are optimistic at the UI layer

`useEvents.createOptimistic` updates local state synchronously, then
fires the Firestore write. UI is committed before persistence
confirms.

### R20.2 No retry, no rollback on write failure

V2 assumes writes succeed. V3 should consider a failure surface for
the small % of writes that hit network errors.

### R20.3 Firestore converters coerce missing `kind` and `recorded`

Legacy docs without these fields are coerced via `deriveKind` and
`deriveRecorded`. V3 should track when this fallback can be removed
(once Firestore confirms zero docs without the fields).

### R20.4 `eventKey` uniqueness within a day is NOT enforced at the database

Multiple docs with same eventKey can exist (Start+End pair, or stale
manual overrides). Engine must dedupe by eventKey.

### R20.5 Day collection: `days/{dayId}` with subcollection `events/`

Days are top-level under children. Events are nested under their day.

### R20.6 Settings, Templates, Days, Events all live under `children/{childId}`

Multi-child path-prefix already exists; multi-child UI is out of scope
for V3 (see OUT_OF_SCOPE).

---

## Cross-Cutting Concerns

### CC1 Performance budget

Engine must complete `projectDay` in under 50ms on a typical day's
data (≈100 events).

### CC2 Idempotency

Re-running the same `projectDay(input)` must produce identical output.

### CC3 Display vs storage separation

Engine outputs an in-memory event list with display-tuned eventKeys
(R5.4). Firestore docs retain originals.

### CC4 V2 backward compatibility

V3 reads V2 Firestore docs without migration. New writes use V3 schema.

---

## Source References

- V2 source: `src/domain/*.ts`, `src/components/Timeline/*.tsx`,
  `src/components/shared/EventEditDrawer.tsx`, `src/app/(authed)/*`.
- Locked decisions:
  `~/.claude/projects/.../memory/project_decisions.md`.
- Strategy plan: `docs/V3_REWRITE_PLAN.md`.
- Edge cases derived from rules: `docs/v3/EDGE_CASES.md`.
- Architecture proposal: `docs/v3/ARCHITECTURE_V3.md`.

---

## Review Log

### Review 1 (Jake, 2026-05-08)

Applied changes:
- **§1.7**: Owner type made extensible (parent1 / parent2 / other[]
  with display config). Multi-name "other" support.
- **§4.1**: Wake-window owner inheritance from same-index nap REMOVED.
  WW owners now come from template or manual only.
- **§5.8**: Hard 19:00 suppression replaced with explicit
  `bottleChain.{maxBottlesPerDay, latestProjectedStart}` settings to
  support overnight bottles when configured.
- **§5.10**: First bottle of day no longer auto-anchored to wake
  time; requires manual Start.
- **§7.1**: Bedtime endTime sources from `settings.defaultWakeTime`
  (next morning) rather than hardcoded "30:00".
- **§7.6**: Bedtime starts at preceding WW's natural end; WW is NOT
  shortened to fit a bedtime threshold. `bedtimeThreshold` is now a
  trigger, not a clip.
- **§8.0** (new): Dream feed coexists with overnight bottles; doesn't
  suppress them.
- **§8.8**: Dream feed owner defaults to OPPOSITE of bedtime owner.
- **§10.3**: FAB usable on any page; events live on /timeline.
- **§11**: "Cook Dinner" generalized to "Daily Recurring Events" —
  multiple, named, with optional duration / owner / per-day suppression.
- **§12.2/3/5/6**: Rewrote in plain English. Wake windows no longer
  inherit from naps. Bedtime no longer falls back to lastNapOwner.
- **§12.8**: Pump owner from `Settings.pumpOwnerSlot`. Dream feed =
  opposite of bedtime owner.
- **§13**: Templates user-named, unbounded count; copy/flip from
  yesterday shortcuts; assignable types include `dailyRecurring`.
- **§14.4.1** (new): "Start New Day" UI surface is contextual, not
  always shown.
- **§16**: Note added — V3 does NOT redesign Timeline UI; rules just
  document V2 behavior so V3 engine output stays compatible.
- **§17.3**: Helper hint text on auto-fill of endTime.
- **§17.9** (new): Buttons use terse labels; no descriptive subtitles.
- **§19.3**: Settings defaults updated for new fields.
