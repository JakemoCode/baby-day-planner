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

- [§0 Engine Philosophy — Predictive, Not Prescriptive](#0-engine-philosophy--predictive-not-prescriptive)
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
- [§21 Daycare Dropoff & Pickup](#21-daycare-dropoff--pickup)
- [§22 Membership Management](#22-membership-management)

---

## §0 Engine Philosophy — Predictive, Not Prescriptive

The engine's job is to **predict and plan**, not to enforce. Given a
set of recorded events (actuals), configuration (templates, settings,
owners), and the current time, it produces a forecast of the rest of
the day.

**Reality wins.** When user-recorded reality conflicts with the
forecast, the engine reshapes the forecast around what actually
happened, never the reverse. Saving an actual event re-runs the
cascade; the day is re-predicted, not validated against the old
prediction.

**Validations exist only at two boundaries:**
1. **Data integrity** — values that are physically impossible or
   would corrupt persistence (negative durations, missing required
   fields, malformed times). These reject saves with field-level
   errors.
2. **Interface hygiene** — confirm dialogs that protect against
   button-mash duplicates and "did you really mean this?" cases. These
   *delay* a save with a single confirm; they never block.

The engine never refuses to record an event because it conflicts with
its own projection. A recorded mid-nap bottle, a recorded nap during
"bedtime," a recorded wake window stretching past a bedtime threshold
— all are accepted; the engine adjusts everything downstream.

**Probability framing.** Settings like `bedtimeThreshold` express
"after this time, the most likely interpretation of a sleep event is
that it's bedtime." They don't impose; they shape the prediction and
sometimes prompt the user to confirm an interpretation. See R7.6 and
R7.6.1.

Every rule in this document should be readable through this lens. If a
rule reads as "the engine refuses X," check whether it's data
integrity, interface hygiene, or actually prescriptive. The third case
is a bug in the requirements.

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
`other = [{ id: 'caregiver1', displayName: "Caregiver" }]`.

**`displayName` is a free-form, user-editable string** — the user
types whatever they want in Settings ("Jake", "Mom", "Papa", "Kelly",
"Grandma Rose"). The engine never inspects the string; it's purely
for presentation. Only the slot identity (`parent1` / `parent2` /
`other:id`) participates in template lookups and inheritance rules.

First-run setup screen prompts the user to fill in real names.

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

### R3.9 Naps overlapping another nap prompt to merge (interface hygiene)

If a nap save would create a nap whose range overlaps another
**recorded** nap, the drawer prompts: *"This overlaps Nap N. Merge
into one nap?"* — Merge / Keep Separate / Cancel. Merge produces a
single nap spanning the union of both ranges (`min(start)` →
`max(end)`), preserving the lower nap ordinal and discarding the
higher one. Keep Separate persists both as-is.

Overlap with **projected** naps doesn't prompt — saving the new nap
re-runs the cascade and the projection adjusts.

- **Why** (predictive lens): two genuinely-recorded simultaneous naps
  are nearly always one nap that the user logged in two pieces (Start,
  forgot to End, started again). The engine doesn't refuse the save —
  it offers the most likely interpretation.
- **Edge case it prevents**: timeline showing Nap 2 (14:00–14:45) and
  Nap 3 (14:30–15:30) as separate when they're really one nap.

### R3.10 Nap cannot have `endTime <= startTime` (data integrity)

Drawer validation blocks save with a field-level error message.

- **Why**: zero-length and inverted ranges are physically impossible
  data — this is the data-integrity boundary from §0, not a
  prescriptive rule.
- **Edge case it prevents**: persisting nap_3 with start=10:00,
  end=9:30 which the renderer can't draw.

### R3.10.1 Naps validate against a "realistic" duration range

Drawer validation surfaces a *warning* (not a block) if a nap's
duration falls outside `[settings.napDurationMin, napDurationMax]`
(defaults: 5 min – 240 min). The user can confirm and save anyway.

- **Why** (interface hygiene from §0): catches typos like a 20-hour
  nap from picking the wrong AM/PM, without prescribing what a "real"
  nap looks like for any given child.

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

### R5.6 Projected bottles move out of the [putdown..nap.end] no-feed region to whichever edge is closer to the predicted interval

The "no-feed" region for each nap is
`[nap.startTime - settings.putdownLeadMinutes, nap.endTime]` — the
putdown wind-down (the last few minutes before sleep) is also no-bottle
territory. Feeding right before putting baby down defeats the purpose
of the wind-down; the bottle should land BEFORE the wind-down begins,
not at the moment of sleep onset.

If a **projected** bottle's startTime falls strictly inside the
no-feed region, the engine moves it to whichever region edge —
`nap.startTime - putdownLead` or `nap.endTime` — lands closer to the
previous bottle's startTime + the predicted bottle interval. If the
closer edge is in the past (`< nowMinutes`), move to the far edge
instead.

Adjacent / overlapping naps (e.g. a recorded nap and a projected nap
covering similar times) are merged into a single connected region
before edge selection, so the bottle always lands outside ALL
overlapping naps' no-feed regions in one move (no oscillation cycle —
see PR #42).

**Recorded bottles are never moved.** A user-logged mid-nap bottle is
genuine data (rare, but real — dream feed mid-stretch, parent woke
the baby on purpose). The cascade picks back up from the recorded
bottle's actual time per R5.1.

- **Why** (predictive lens): the engine forecasts the *likely* next
  feed time. Bottles "before nap" vs "after nap" are both plausible;
  pick the one closer to the cadence the cascade was already
  predicting. The wind-down extension reflects real parent behavior:
  you don't feed in the last 15 minutes before sleep.
- **Edge case it prevents**: projection telling a parent to feed
  during the wind-down (which the parent then ignores, breaking the
  cadence forecast for the rest of the day).

### R5.7 Bottle overlap resolution iterates to a fixed point

Moving one bottle to a nap edge can cascade subsequent bottles forward;
those new times might overlap a different nap. Loop until no
adjustments occur in a pass, bounded by `MAX_PASSES = 8`.

- **Why**: single-pass logic missed second-order overlaps.
- **Edge case it prevents**: Bottle 4 moved out of Nap 2 lands inside
  Nap 3.

### R5.8 Bottle chain has no hard upper count or time cutoff

V2 hard-suppressed projected bottles past `bedtimeThreshold` AND
implicitly capped daily emission. V3 removes both. Babies — especially
newborns — are unpredictable and may feed 8–12+ times/day, including
overnight. The engine projects bottles via cascade (R5.1) until either:

- The next projected start would land at/after the next day's
  `defaultWakeTime` (then it's tomorrow's bottle, not today's).
- The user has logged enough bottles that no further projections are
  needed for the day's expected cadence (see R5.11 for the lower
  bound that drives placeholder projection).

There is no `maxBottlesPerDay` setting. There is no `latestProjectedStart`
setting either — the latest projected start is **derived** from the
cascade itself (the previous bottle's start + interval).

- **Why**: prescribing an upper bound makes the engine wrong for
  newborns and for irregular nights.
- **Edge case it prevents**: a parent of a 6-week-old hitting an
  artificial 6-bottle cap and the timeline going blank for the rest of
  the day.

### R5.9 Recorded bottles are always kept regardless of cadence

If the user manually logs a bottle at 03:00, it persists and seeds the
next cascade. No suppression based on time of day.

### R5.10 First bottle of the day is NOT recorded automatically

The first bottle of the day is *recorded* only when the user taps
**Start Bottle Now** (or via FAB). The engine never auto-creates a
recorded bottle at wake time. Until that first tap, any first-bottle
event in the timeline is a **projected placeholder** per R5.11 — its
time is a forecast, not a measurement.

- **Why**: tying a recorded first bottle to wake time produced false
  history that confused users.
- **Edge case it prevents**: dashboard counting "Bottle 1" as logged
  before the user has actually fed the baby.

### R5.11 Expected bottles per day drives placeholder projection

`Settings.bottleChain.bottlesPerDay` (whole number; configurable, no
hard default — set per child's stage) is the **expected lower limit**
of daily intake. The engine projects bottle placeholders up to this
count so the timeline shows expected feeding cadence even before any
bottle has been recorded.

**Anchoring with no recorded bottles**: the first placeholder lands at
`Day.wakeTime + settings.bottleChain.bufferAfterWakeMinutes` (default
10). Subsequent placeholders cascade at `defaultBottleIntervalMinutes`
intervals up to `bottlesPerDay` total. The buffer is what avoids the
"first bottle exactly at wake time" false-history problem from R5.10
while still rendering an actionable forecast from minute one.

**Anchoring after the first recorded bottle**: cascade resumes from
the *latest* recorded bottle's startTime per R5.1. Earlier placeholder
projections from before that recording are dropped.

There is no upper bound (R5.8); reality routinely exceeds
`bottlesPerDay` and additional bottles are added via FAB or via the
cascade once recordings start.

- **Why**: Jake wants the timeline to show the day's expected cadence
  at a glance, without prescribing a ceiling that's wrong for newborns.
- **Edge case it prevents**: empty bottle row first thing in the
  morning, leaving the user no visual sense of when the next feeds
  should land.

### R5.13 Recorded bottles within `minBottleIntervalMinutes` of the previous trigger a confirm

When user taps "Start Bottle Now" and the last bottle was logged less
than `minBottleIntervalMinutes` (default 20) ago, show a confirm
dialog before recording. Default applies if the setting is missing.

- **Why**: protects against accidental double-tap.

---

## §6 Putdown — Pure Prediction Layer

### R6.1 Putdown is purely predictive — never recorded, never persisted

Putdown is a **render-only reminder** that appears in the timeline
preceding any projected nap or bedtime. It says: "to get the baby down
at the predicted start time, begin winding down `~settings.putdownLeadMinutes`
(default 15) before."

Putdown is **not an event**. There is no Firestore document, no
"Start Putdown" / "End Putdown" action, no lifecycle, no owner field
on a putdown record. The engine derives putdown shapes at render time
from the upcoming nap/bedtime; persisting nothing.

- **Why** (predictive lens): putdown is a forecast about the parent's
  behavior, not the baby's. It carries no observation; nothing to
  record.
- **Edge case it prevents**: V2's bug where editing nap owner caused
  the putdown record to disappear because it was a sibling Firestore
  doc. With no doc, nothing can drop out of sync.

### R6.2 Putdown is derived from the next-upcoming projected nap or bedtime

For each projected (`recorded: false`) nap or bedtime whose start is
in the future relative to `nowMinutes`, the renderer emits a virtual
putdown ending at the parent's start time, lasting
`settings.putdownLeadMinutes`.

Recorded naps/bedtime get no putdown (the moment has passed; the
reminder is no longer useful).

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

### R6.7 Putdown is suppressed if `nowMinutes` is past the would-be putdown start

If "now" has already passed the putdown's lead-time window, don't
render it — the reminder window has elapsed.

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

### R7.4 Projected naps starting at or after a bedtime event are not projected

When the engine has emitted a bedtime event (whether via threshold
R7.6 or manual record R7.7), it stops projecting further naps for the
day. Already-recorded naps after that time are kept as-is — see §0,
reality wins.

### R7.5 Projected naps crossing a bedtime are stopped at the bedtime start

A *projected* nap whose start would be < bedtime but whose end would
extend past bedtime is replaced by bedtime (the cascade was about to
predict a bedtime-shaped event anyway). A *recorded* nap crossing a
bedtime is kept — that's the user telling the engine "Aden actually
napped past the bedtime threshold tonight."

### R7.6 `bedtimeThreshold` describes the time after which any sleep is *most likely* bedtime

`settings.bedtimeThreshold` (default `"19:00"`) is a probability
shaping device: after this clock time, when the baby goes down, he is
**almost certainly** going to stay down for the night, regardless of
the parent's intent.

The engine uses it in two ways:

1. **Cascade replacement** — when projecting the day, the first nap
   whose start time would land at or after the threshold is replaced
   by bedtime. The bedtime event takes that nap's start time. The
   preceding wake window keeps its natural length; nothing is clipped.
2. **Convert prompt** (R7.6.1) — when the user starts a recorded nap
   close enough to the threshold that it might really be bedtime, the
   UI asks.

The threshold does NOT clip wake windows. It does NOT prevent the user
from recording a normal nap after that time (Aden could still wake up
after a standard nap length — slim, not zero). It only shapes the
*default prediction* and the *convert prompt*.

- **Why** (predictive lens): "almost certainly bedtime" is not "must
  be bedtime." The threshold expresses likelihood; the engine acts on
  the likelihood without imposing.

### R7.6.1 Recorded sleep starting within `defaultNapLengthMinutes` of `bedtimeThreshold` prompts to convert to bedtime

When the user records a sleep event whose start time is within
`settings.defaultNapLengthMinutes` of `bedtimeThreshold` (i.e. a
nap-length window ending at the threshold), the UI prompts:
*"Start bedtime instead of Nap N?"* — Bedtime / Nap / Cancel.

Picking Bedtime converts the event's `kind` to `"block"` with
`eventKey: "bedtime"`. Picking Nap saves it as a nap; if the recorded
nap later runs past the threshold, it stays a nap (the user
explicitly chose).

Concretely:
- Settings: `bedtimeThreshold = 19:00`,
  `defaultNapLengthMinutes = 60`.
- User taps Start Nap at 18:15. Window is `[18:00, 19:00]`. 18:15 is
  inside → prompt fires.
- User taps Start Nap at 17:30. Outside window → no prompt; saved as
  nap.

- **Why** (predictive lens): a sleep event in the danger zone is most
  likely bedtime, but we ask rather than assume.

### R7.7 Manual bedtime is the user's authoritative declaration of bedtime time

If the user explicitly records a bedtime (via drawer or the
End-of-day flow), `bedtime.startTime = recorded value`. Subsequent
projection treats this as the bedtime anchor for the cascade-stop
behavior in R7.4 / R7.5.

A manual bedtime does NOT retroactively clip already-recorded wake
windows or drop already-recorded naps (those are reality — see §0).
It DOES stop *projection* of further naps and clamp the *projected*
wake window leading up to it. If a recorded WW already extends past
the manual bedtime, the timeline shows both — the user can see the
overlap.

- **Why** (predictive lens): user input is highest-confidence data
  but doesn't rewrite history.
- **Edge case it prevents**: V2's "manual bedtime erases recorded
  data" behavior — the user moves bedtime earlier and a recorded nap
  silently disappears from history.

### R7.8 Removed (folded into R7.7)

Wake-window handling around manual bedtime is part of R7.7. No
separate "drop ww that starts after manual bedtime" rule — the
projection naturally won't emit one, and a recorded one stands.

### R7.9 Removed (no stretching; reality wins)

The "stretch WW into the dropped nap" hack from V2 doesn't apply when
recorded data isn't being dropped.

### R7.10 Bedtime threshold default = `"19:00"` (settings)

User-configurable. Affects threshold-replacement (R7.6) and the
convert prompt (R7.6.1).

### R7.11 Threshold-driven bedtime takes the substituted nap's `startTime`

When the cascade reaches `nap_N` whose start ≥ threshold, the engine
replaces nap_N with bedtime where `bedtime.startTime = nap_N.startTime`.

### R7.12 Bedtime renders with sage-tint fill, darker stroke

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

### R12.2 Projected naps inherit owner from the day's template, by nap number

In plain English:

> A template carries a list of owners — one entry for each nap of the
> day. The first entry is for nap 1, the second is for nap 2, and so
> on. When the engine projects today's naps and the day has a template,
> each nap looks up its corresponding entry in the list and uses that
> owner.

Concrete example: today's template's nap-owner list reads
`[Kelly, Jake, Daycare, Jake]`. The engine projects 4 naps. Nap 1
gets Kelly, nap 2 gets Jake, nap 3 gets Daycare, nap 4 gets Jake.

If the list has fewer entries than naps the day produces, the leftover
naps have no owner. If no template is assigned to the day at all, no
projected nap has an owner — they render unassigned until the user
explicitly picks one (drawer or /day-templates picker).

Schema:
```ts
OwnershipTemplate.napOwners: OwnerRef[];
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

### R12.6 Projected bottles inherit owner from the day's template, by bottle number

In plain English (same shape as R12.2 for naps):

> A template can carry a list of bottle owners — one entry for each
> bottle of the day. The first entry is for bottle 1, the second is
> for bottle 2, and so on. When the engine projects today's bottles
> and the day has a template, each bottle looks up its corresponding
> entry in the list and uses that owner.

Concrete example: today's template's bottle-owner list reads
`[parent1, parent2, parent2, parent1, parent2]`. Projected bottle 1
gets parent1, bottle 2 gets parent2, etc. (Note: bottle ordinals are
chronological per R5.4, so "bottle 1" = the day's earliest bottle by
time, regardless of the eventKey it has in Firestore.)

If the list is shorter than the projected bottle chain, leftover
bottles have no owner. If no template is assigned, projected bottles
have no default owner.

Schema:
```ts
OwnershipTemplate.bottleOwners?: OwnerRef[];
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

### R14.4 The new day begins when bedtime ends

V3 treats bedtime/overnight as a duration event with a definite end:
the user taps **End Bedtime** (alias: "Wake Up" / "Start Day") on the
prior day's bedtime block. That tap closes yesterday's bedtime
(`endTime = now()`) and creates today's Day record with
`wakeTime = now()`. The two are the same action, expressed from
yesterday's frame of reference.

- **Why**: between bedtime start and bedtime end, the engine assumes
  the baby is asleep. Modeling overnight as a single duration removes
  the ambiguous "post-bedtime, pre-tomorrow" gap.
- **Edge case it prevents**: bottles, naps, or other events being
  projected into the overnight window before the user has actually
  started the new day.

### R14.4.1 No standalone "Start New Day" button

The dashboard does NOT carry a dedicated Start-New-Day surface. Day
creation is a side-effect of ending bedtime (R14.4). This frees the
dashboard space previously occupied by Start-New-Day for live status
or other contextual actions; specific reuse is open and decided after
the V3 engine rebuild ships.

The only fallback path: if no active day exists AND no prior bedtime
is open (cold start, fresh install, archived yesterday with no
bedtime), the dashboard offers a one-tap "Start Day" affordance.

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
- `bottleChain`: { bottlesPerDay: number;
  bufferAfterWakeMinutes: number } — expected lower limit of daily
  intake plus the wake-to-first-placeholder buffer (default 10) that
  anchors the placeholder projection per R5.11. No upper bound and no
  fixed `latestProjectedStart`; both are derived from the cascade
  (R5.8). Configurable per child.
- `pumpOwnerSlot`: "parent2" (drives pump owner default — R12.8)
- `dailyRecurring`: [] (replaces `cookDinner` — R11)
- `owners`: { parent1: {displayName, color}, parent2: {...},
   other: [...] } (configurable owner slots — R1.7)
- `daycare`: { enabled, dropoffTime, pickupTime, ownerId } (R21).
  `ownerId` references an `owners.other[]` entry. Default disabled;
  when first enabled, prompt user to confirm/create the daycare
  owner entry.

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

## §21 Daycare Dropoff & Pickup

### R21.1 Two new instant event types: `daycare_dropoff`, `daycare_pickup`

Both are `kind: "instant"` events with full lifecycle support
(projected → completed). They render as instant chips on the timeline.

- **Why** (predictive lens): a custodial handoff is a fact about
  *when* care transferred. Modeling it as an event lets the engine
  predict who owns events between the two moments.

### R21.2 Daycare events are projected from settings each day, when enabled AND today is a daycare day

```ts
Settings.daycare = {
  enabled: boolean;            // master toggle for the feature
  dropoffTime: TimeMin;        // default time to project (e.g. 8:30)
  pickupTime: TimeMin;         // default time to project (e.g. 17:30)
  ownerId: string;             // points to a Settings.owners.other[id]
                               //   entry whose displayName is the
                               //   custodial provider's name
                               //   (default user-set: "Daycare").
  weekdays: WeekdayFlags;      // which days of the week to project
                               //   { mon, tue, wed, thu, fri, sat, sun: bool }
                               //   default: { mon..fri: true, sat..sun: false }
};
```

The engine projects `daycare_dropoff` and `daycare_pickup` only when
ALL of the following are true:
1. `Settings.daycare.enabled === true`
2. `Settings.daycare.weekdays[today]` is true
3. `Day.suppressedDaycareDay !== true` (R21.5)

Both events default-own to `daycare.ownerId` (a parent doing drop-off
can edit to their parent slot if they want).

### R21.3 Projected naps and bottles whose start falls between dropoff and pickup auto-assign Daycare

For any *projected* `nap` or `bottle` event whose `startTime` is at or
after the day's `daycare_dropoff.startTime` and strictly before the
day's `daycare_pickup.startTime`, the engine assigns
`owner = daycare.ownerId` (slot id pointing into `other[]`) — UNLESS
the template explicitly assigns a different owner for that index, OR
the user has manually overridden the owner.

Recorded events are not retroactively reassigned (§0 reality wins).
The owner inferred at recording time stays. This rule shapes
*projection only*.

Precedence (highest to lowest, per R12 owner inheritance):
1. User manual edit (drawer assignment)
2. Template explicit assignment for that index
3. **Daycare window auto-assign (R21.3)**
4. Default owner-resolution rules (R12)

- **Why** (predictive lens): the most likely caregiver during daycare
  hours is daycare. The engine predicts; user can override.
- **Edge case it prevents**: every nap during daycare hours rendering
  as unowned because the template wasn't set up for daycare days.

### R21.4 Dashboard CTA reflects daycare events when next-projected

When the next projected event is `daycare_dropoff`, the dashboard
shows two actions:
- **Primary**: "Daycare Dropoff" — transitions the event
  `projected → completed`.
- **Secondary**: "No daycare today" — sets
  `Day.suppressedDaycareDay = true` (R21.5), removing both daycare
  events from today and clearing R21.3 auto-assigns. After the tap,
  the dashboard immediately advances to the next now-projected event.

When the next projected event is `daycare_pickup`, the dashboard
button label is "Daycare Pickup" (single primary action; no
"No daycare today" secondary because by definition the day already
included drop-off).

- **Why**: consistency with the "Start Nap N" / "Start Bottle Now"
  pattern. The "No daycare today" surface puts the suppression
  one-tap away on exactly the day it matters (kid woke up sick,
  parent decides at 7am to keep them home).
- **Edge case it prevents**: parent has to navigate to settings or
  the day-detail page to suppress daycare when they realize the kid
  is staying home, while the dashboard insists "Daycare Dropoff next".

### R21.5 Per-day daycare suppression

A day can opt out via `Day.suppressedDaycareDay: boolean`. Suppressed
days project no daycare events and don't trigger R21.3 owner
auto-assign. Suppression entry points:
- Dashboard "No daycare today" secondary action when daycare_dropoff
  is the next projected event (R21.4).
- Day-detail / start-of-day flow toggle ("Aden home today?").
- Day-templates picker (when planning ahead for a known holiday).

Suppression can be undone (toggle back to false). Already-recorded
daycare events on that day are not deleted by suppression — only
*projected* daycare events are removed (§0 reality wins).

- **Why**: kid sick, parent home for the day, snow day, holiday.
- **Edge case it prevents**: phantom daycare-owned naps on a day
  the parent is actually doing them at home.

### R21.6 Dropoff after pickup is invalid configuration (data integrity)

Settings validation: `daycare.dropoffTime < daycare.pickupTime` (after
both being normalized into the same day). Inverted ranges block save
on the settings form.

- **Why**: this is the §0 data-integrity boundary, not prescriptive —
  an inverted window has no defined semantics.

### R21.7 Recorded daycare events override projected times

If the user records a daycare_dropoff at 8:42 (manual time edit),
R21.3's window for that day uses the recorded time (8:42) as the
window start, not the projected 8:30. Same for pickup. Reality wins
(§0); the auto-assign window tracks the actual handoff.

---

## §22 Membership Management

> Replaces V2's hardcoded allowlist (`src/lib/auth/allowlist.ts` +
> `firestore.rules`) with a settings-managed list of co-parent emails.
> This is the "lightweight sharing" feature; full role-based sharing
> stays out-of-scope (`OUT_OF_SCOPE.md` §2).

### R22.1 Allowlist lives in Firestore at `config/allowlist`

```ts
type AllowlistDoc = {
  emails: string[];           // lowercase, deduped
  updatedAt: Timestamp;
  updatedBy: string;          // email of the member who last edited
};
```

The doc is a top-level singleton at `/config/allowlist`. Initial
seed: `["jake136@yahoo.com", "kellyrbarber@gmail.com"]`. Once V3
ships, the hardcoded `ALLOWLISTED_EMAILS` constant is deleted.

### R22.2 All members have equal full-access permissions

There is no role gradient. Every email in the allowlist gets the same
read/write access as every other email. View-only and tiered roles
are explicitly out-of-scope (`OUT_OF_SCOPE.md` §2 — confirmed-out).

### R22.3 Firestore rules check membership via `get()` lookup

```js
function isAllowlisted() {
  return request.auth != null
    && request.auth.token.email in
       get(/databases/$(database)/documents/config/allowlist).data.emails;
}
```

The `config/allowlist` doc itself is readable by any authenticated
user (so the client can subscribe). It's writable only by current
members.

### R22.4 Settings page exposes a "Members" section

UI rules:
- Lists current member emails with their join date (if known) and a
  remove button next to each.
- "Add member" input: validates email format. On save, lowercases and
  dedupes.
- Adding an email persists to `config/allowlist.emails` and stamps
  `updatedBy = currentUser.email`.

### R22.5 Removing members has guards

- A member can remove anyone, including themselves, EXCEPT: the last
  remaining member cannot be removed (the operation would orphan the
  data and lock everyone out).
- Removing yourself triggers a confirm: "You'll be signed out and
  lose access. Continue?" On confirm: remove email, sign out, redirect
  to sign-in (where the now-non-allowlisted email will be rejected).
- Removing another member triggers a softer confirm: "Remove
  `email@example.com`? They'll lose access immediately."

### R22.6 Adding an email does NOT send an invitation

The user being added must already have a Google account matching that
email and must sign in via Google to gain access. There is no email,
SMS, or in-app notification to the new user — communication is the
adding member's responsibility (out-of-band).

- **Why**: invitation flows are the heavy version covered by
  OUT_OF_SCOPE §2. R22 stays light.
- **Edge case it prevents**: misspelled emails sitting in the
  allowlist forever — the worst that happens is dead-string rows.

### R22.7 Email comparison is case-insensitive

All writes lowercase the email; the rule check uses the exact stored
form against `request.auth.token.email` (which is always lowercase
for Google-issued tokens).

### R22.8 The client `isAllowlisted()` subscribes to the doc

```ts
// src/lib/auth/allowlist.ts (V3 — replaces hardcoded constant)
export function useAllowlist(): { emails: string[]; loading: boolean } {
  // onSnapshot to /config/allowlist; cached in a context provider
}
```

The auth flow blocks on the first allowlist read; subsequent updates
propagate live (so a removed user gets bounced within seconds without
a refresh).

### R22.9 First-time setup seeds the allowlist if missing

If the V3 build runs against a Firestore where `/config/allowlist`
doesn't exist:
1. The very first authenticated request reads `null` → auth treats
   nobody as allowlisted (closed-by-default).
2. A one-time CLI/seed script (`pnpm seed:allowlist`) writes the doc
   with the founding member set.
3. Documented in `README.md` setup steps.

This avoids a chicken-and-egg deploy where the rules require the doc
but the doc can't be written because the rules require the doc.

### R22.10 Membership changes log to an activity collection (optional, behind flag)

Each add/remove can optionally write a row to `/config/allowlist_log`
with `{ action, target, actor, at }`. Defaults off; useful for audit
if the founding members want it.

(Mark as `OPEN`: ship this in V3 or punt to V4? Recommend punting —
trivial to add later, no audit demand right now.)

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

- V2 source: deleted in PR-C1 (2026-05-11); reachable via `git log -- src/domain/`.
- Locked decisions:
  `~/.claude/projects/.../memory/project_decisions.md`.
- Strategy plan (historical): `docs/_archive/V3_REWRITE_PLAN.md`.
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

### Review 2 (Jake, 2026-05-08)

Refinements to Review 1:

- **§1.7**: confirmed `parent1` / `parent2` `displayName` is a
  user-editable free-form string ("Jake", "Mom", "Papa Joe", etc.).
  Engine never inspects the string; only the slot id participates in
  rules.
- **§7.6/R7.7/R7.8**: rewrote bedtime model. The `bedtimeThreshold`
  setting is a simple **trigger**: the first nap whose start ≥
  threshold becomes bedtime. Threshold-driven bedtime preserves the
  preceding wake window (no clipping). **Manual** bedtime is still a
  hard wall that clips WW + drops naps; the two cases are now
  separate sections (R7.6 trigger, R7.7 hard-wall manual).
- **§12.2**: rewrote in fully plain English with a concrete example.
  Removed the `[N-1]` notation; explained as "first entry = nap 1,
  second entry = nap 2," etc.
- **§12.6**: same plain-English rewrite for bottles. Notes that
  bottle ordinals are chronological per R5.4, so "bottle 1" always
  means the day's earliest bottle.
- **other[]**: confirmed multiple distinct entries supported (no
  change needed — already in §1.7.1).
- **pump owner**: confirmed configurable via
  `Settings.pumpOwnerSlot` (no change needed — already in R12.8).
- **OUT_OF_SCOPE §3**: marked `moved-in` ✓ (per-day suppression now
  R11.6).

### Review 3 (Jake, 2026-05-08)

- **§5 / R5.11** (new): `Settings.bottleChain.bottlesPerDay` (whole
  number, configurable per child) projects bottle placeholders for
  the expected lower limit of daily intake. Reality routinely exceeds
  this; additional bottles come from FAB or the cascade.
- **§5 / R5.8 + R5.9**: removed `maxBottlesPerDay` and removed the
  fixed `latestProjectedStart`. Babies (especially newborns) are
  unpredictable and may feed 8–12+ times/day. No upper count cap; no
  fixed time cutoff. Cascade projects until the next start would land
  in tomorrow.
- **§14 / R14.4 + R14.4.1**: the dedicated "Start New Day" action is
  removed. Bedtime is a duration event running from "Begin Bedtime"
  → "End Bedtime" (a.k.a. Wake Up / Start Day); the engine assumes
  the baby is asleep across that span. Tapping End Bedtime closes
  yesterday's bedtime AND creates today's Day record. The freed
  dashboard space is open and decided after the V3 engine rebuild.
- **§19.3**: `bottleChain` simplified to `{ bottlesPerDay }`.

### Review 4 (Jake, 2026-05-08)

Predict-don't-prescribe pass. Added new §0 Engine Philosophy as the
canonical lens; rewrote rules that imposed engine constraints on user
recordings.

- **§0** (new): Engine Philosophy. Engine predicts; reality wins.
  Validations only at data-integrity and interface-hygiene boundaries.
- **§3 / R3.9**: nap–nap overlap → "merge into one nap?" prompt
  (interface hygiene), not a save-block. Overlap with projected naps
  doesn't prompt at all (cascade re-projects).
- **§3 / R3.10.1** (new): nap duration outside `[5, 240]` min → soft
  warning, user can save anyway.
- **§5 / R5.6**: bottle inside a nap moves to whichever edge is
  closer to the predicted interval (was: nearer edge unconditionally).
  Recorded mid-nap bottles are accepted (rare but real).
- **§6 — Putdown rewritten as pure prediction**. No Firestore doc, no
  lifecycle, no record/edit. Render-only reminder derived from the
  next-upcoming projected nap/bedtime. Eliminates V2's "edit owner
  drops the putdown record" class of bug entirely.
- **§7 / R7.4 + R7.5**: bedtime "drops" naps only in the
  *projection*. Recorded naps after a bedtime are kept as-is.
- **§7 / R7.6**: rewrote bedtimeThreshold doc to reflect probability
  framing — "after this time, sleep is *most likely* bedtime." Acts
  via cascade-replacement and a convert prompt; does not impose.
- **§7 / R7.6.1** (new): if user records sleep starting within
  `defaultNapLengthMinutes` of `bedtimeThreshold`, prompt
  Bedtime/Nap/Cancel.
- **§7 / R7.7**: manual bedtime is "authoritative declaration," not
  a hard wall. Stops further projection and clamps projected WW;
  doesn't rewrite recorded events.
- **§7 / R7.8 + R7.9**: removed (folded into R7.7; no retroactive
  clipping or stretching).
- **§5 / R5.13**: kept (interface hygiene — guards against
  button-mash duplicates, not engine prescription).

### Review 5 (Jake, 2026-05-08) — Daycare dropoff/pickup

- **§21** (new): two new instant event types `daycare_dropoff` /
  `daycare_pickup`. Configurable defaults in
  `Settings.daycare.{enabled, dropoffTime, pickupTime, ownerId}`.
  `ownerId` references an `owners.other[]` entry.
- **R21.3**: projected naps/bottles inside the daycare window
  auto-assign daycare as owner. Precedence: manual edit > template
  > daycare auto-assign > default. Recorded events stand (§0).
- **R21.4**: dashboard CTA reflects daycare events when next-projected.
- **R21.5**: per-day suppression via `Day.suppressedDaycareDay`
  ("Aden home today").
- **R21.7**: recorded dropoff/pickup times shift the auto-assign
  window (reality wins).
- **§19.3 Settings**: added `daycare` config block.
- **R21.2**: added `weekdays: WeekdayFlags` to daycare settings —
  Mon/Tue/.../Sun checkboxes; default Mon–Fri true. Engine only
  projects daycare events when today's weekday flag is true (in
  addition to `enabled` and not-suppressed).
- **R21.4**: when `daycare_dropoff` is next-projected, dashboard
  shows a secondary "No daycare today" action that toggles
  `Day.suppressedDaycareDay = true` and advances to the next event.
  One-tap suppression for "kid woke up sick, staying home today."

### Review 6 (Jake, 2026-05-08) — Settings-managed allowlist

- **§22** (new): Membership Management. Allowlist moves from
  hardcoded `src/lib/auth/allowlist.ts` + `firestore.rules` to a
  Firestore doc at `/config/allowlist`. Settings page exposes a
  "Members" section; current members can add/remove emails. All
  members are full-access equals (tiered roles stay out-of-scope per
  OUT_OF_SCOPE §2). No invitation flow — out-of-band communication.
- **OUT_OF_SCOPE §2**: clarified — full role-based sharing
  (view-only, tiered, invitation tokens) stays `confirmed-out`.
- **OUT_OF_SCOPE §2.5** (new): settings-managed allowlist
  `moved-in`, lands in §22.
