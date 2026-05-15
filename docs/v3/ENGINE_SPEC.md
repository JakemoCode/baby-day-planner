# ENGINE_SPEC.md — V3 Scheduling Engine Rules

> This doc is the authoritative spec for **what the V3 engine computes**.
> It covers only scheduling rules, pipeline invariants, and owner-inference
> logic. For the data schema and event lifecycle, see
> [DATA_MODEL.md](DATA_MODEL.md). For timeline display, drawer behavior, and
> UX concerns, see [RENDER_SPEC.md](RENDER_SPEC.md). Historical rules
> (pre-reorg) are preserved in
> [docs/_archive/v3/REQUIREMENTS_v3_legacy.md](../_archive/v3/REQUIREMENTS_v3_legacy.md).

---

## Table of Contents

- [§0 Engine Philosophy — Predictive, Not Prescriptive](#0-engine-philosophy--predictive-not-prescriptive)
- [Removed Concepts](#removed-concepts)
- [§3 Naps](#3-naps)
- [§4 Wake Windows](#4-wake-windows)
- [§5 Bottles](#5-bottles)
- [§6 Putdown](#6-putdown)
- [§7 Bedtime](#7-bedtime)
- [§9 Pumps](#9-pumps)
- [§10 Custom Events (Extras)](#10-custom-events-extras)
- [§11 Daily Recurring Events](#11-daily-recurring-events)
- [§12 Owner Inheritance](#12-owner-inheritance)
- [§13 Day Templates](#13-day-templates)
- [§15 Engine Pipeline Invariants](#15-engine-pipeline-invariants)
- [§21 Daycare Dropoff & Pickup](#21-daycare-dropoff--pickup)
- [Cross-Cutting Concerns](#cross-cutting-concerns)

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

## Removed Concepts

### Dream Feed

Dream feed has no engine logic. It is a render-time label applied to
the first projected bottle whose `startTime > bedtime.startTime` when
`settings.dreamFeed.enabled === true`. See [RENDER_SPEC.md](RENDER_SPEC.md)
and `src/v3/ui/dreamFeedLabel.ts` for the label application behavior.

Historical engine rules R8.0–R8.9 are archived in
[REQUIREMENTS_v3_legacy.md](../_archive/v3/REQUIREMENTS_v3_legacy.md).
They were removed because dream feed is not a scheduling concern — it
is purely a display concern. See `docs/v3/SIMPLIFICATION_SCOPE.md §3`
for the decision rationale.

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

### R5.6 Projected bottles move out of the `[nap.start, nap.end]` no-feed region to whichever edge is closer to the predicted interval

The no-feed region for each nap is `[nap.startTime, nap.endTime]` — the
nap itself. (Note: the putdown wind-down is NOT part of the no-feed
region; wind-down is render-only and a bottle can legitimately be the
entirety of wind-down. See `docs/v3/SIMPLIFICATION_SCOPE.md §7 Q2`.)

If a **projected** bottle's startTime falls strictly inside the
no-feed region, the engine moves it to whichever region edge —
`nap.startTime` or `nap.endTime` — lands closer to the
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
  predicting.
- **Edge case it prevents**: projection telling a parent to feed
  during the nap (which the parent then ignores, breaking the
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

> **R5.13 — Deleted.** The "confirm if recorded too soon" engine flag is
> fully removed. Predict-don't-prescribe: the drawer's existing 15-min
> accidental-duplicate guard (UX layer) is the only protection needed
> at record-time. Smaller bottles legitimately produce shorter intervals
> (DOMAIN.md §2); the engine has no business calling that anomalous.
> See `SIMPLIFICATION_SCOPE.md §7 Q4` for the decision rationale.

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
3. **Default rule** — for one specific case (pump owner).
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

### R12.8 Pump owner defaults to a specific configured slot

**Pumps**: every pump's default owner is `Settings.pumpOwnerSlot`.
V3 default = `parent2` (per Jake: pumping is Kelly's domain in his
setup; configurable for other families).

This is the ONLY event with a rule-derived (vs. template-derived)
default owner. Dream-feed engine-side owner inheritance has been
removed; see [Removed Concepts](#removed-concepts) and
`SIMPLIFICATION_SCOPE.md §3.3`.

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
Pumps don't use the picker (R12.8 handles them via explicit Settings).

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

## §15 Engine Pipeline Invariants

### R15.1 The pipeline is order-dependent; V3 encodes dependencies as data via the topo-sorted evaluator

V3 pipeline (current — see `src/v3/engine/rules/index.ts` for
`ALL_RULES` export and the topo-sort evaluator in
`src/v3/engine/evaluator.ts`):

1. `projectNapChain` (includes bedtime substitution — R7.5/R7.6/R7.11)
2. `applyNapActuals`
3. `applyWakeWindowOverrides`  ← must run after step 2 (cascade
   times must exist before metadata merge)
4. `addPutdownEvents`          ← must run after step 3 (knows which
   naps survive bedtime; putdown is render-only derive)
5. `projectBottleChain`
6. `resolveBottleNapOverlap`   ← must run after step 4 (knows all
   nap times)
7. `renumberBottles`           ← must run after step 6
8. `mergePumpsAndExtras`
9. `applyTemplate`             ← must run last (sees final shape)

Notes: `addDreamFeed` has been removed from the pipeline (dream feed
is now a render-time label — see [Removed Concepts](#removed-concepts)).
`suppressBottlesAfterBedtime` has been removed (bottle chain now stops
at midnight per R5.8, not at bedtime). V3 encodes ordering as declared
rule dependencies, not implicit function order.

### R15.2 The output is sorted by `startTime` ascending

Final result of `projectDay` is sorted before return.

### R15.3 The pipeline is pure: same `(day, settings, actuals, template, nowMinutes)` produces same output

No randomness, no Date.now() inside, no I/O.

### R15.4 `nowMinutes` defaults to `24*60` when not provided

End of day. Used for bottle overlap "is closer edge in past" check.

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
