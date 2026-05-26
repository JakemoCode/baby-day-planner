# Glossary (V3)

Authoritative definitions for terms used across the codebase, specs,
and dogfood feedback. Updated lazily as terms are resolved during
grills. Not a spec.

## projected

Engine output. The forecast — "if everything keeps going as it has,
this event will happen at this time." Not persisted to Firestore.

## recorded

A field on a persisted event meaning **a physical fact about the day
has happened in reality** — a time (start, end) or an amount that
refers to a moment already past. Reality, not user intent, is the
gate. Owner-only edits are **planning**, not recording. Time edits
into the future are also **planning** (you can't claim something
happened at a time that hasn't arrived yet).

Established 2026-05-25 (§F66 grill). Supersedes DATA_MODEL.md R2.2's
claim that owner-only edits promote projected→recorded.

## planning intent

Any user-committed annotation that does NOT assert a past reality.
Three shapes today:

1. Owner-only edit on any event ("Daycare will do nap 3").
2. Time edit on an event where the resulting time is *future* relative
   to Now ("let's plan for bedtime at 7:30 tonight").
3. Amount edit on a future bottle ("plan for 6oz at the dream feed").

Persisted, but does not flip `recorded`. The event remains a forecast
plus user intent. Does NOT count toward dashboard ordinals, cascade
anchoring, or "this happened" gates.

Established 2026-05-25 (§F66 grill).

## Now-cross promotion

The primitive lifecycle rule: when wall-clock Now crosses a projected
event's relevant time, the event auto-promotes to `recorded`.

- **Instant event (bottle)**: Now ≥ time → recorded at projected time
  + default amount.
- **Interval event (nap, bedtime)**: Now ≥ startTime → start
  auto-records at projected startTime (in-progress).
  Now ≥ endTime → end auto-records at projected endTime (completed).
- **In-progress carve-out**: while start ≤ Now < end of a nap, the
  dashboard's single contextual button shows "End Nap" and closes
  the nap by setting endTime = Now. See [[dashboard contextual button]]
  for the full mode logic.
- **Honesty mechanic**: if an event didn't actually happen, user
  deletes it via the drawer. If it ran longer than projected, user
  edits the relevant time forward (which, per the edit-into-future
  rule, may revert it to projected planning intent depending on
  where the new time lands).

Replaces: NapActionButton "Start Nap Now," "Start Bedtime Now,"
"Start Bottle Now," dashboard CTAs of the action-button kind.

Established 2026-05-25 (§F66 grill).

## dashboard contextual button

A single multi-modal button slot on the dashboard. Hidden by default;
shows a mode-specific label when a contextual action is available.

**Mode priority (highest first):**

| Condition | Mode label | Action on tap |
|---|---|---|
| In-progress nap (start ≤ Now < end) | **End Nap** | Set nap.endTime = Now |
| In ±15min of a projected bottle's startTime, no in-progress nap | **Log Bottle Time** | Write recorded bottle: startTime = Now, amount = default (overwrites any auto-promoted projection at that slot) |
| Neither | (hidden) | — |

**Window** is symmetric ±15min around the projected bottle's
startTime. Outside the window, manual edit via drawer is the path.

**Overlap precedence:**
- *Bottle window straddles in-progress nap*: End Nap wins until the
  nap auto-promotes to completed (Now-cross of nap.endTime). Then if
  still in the bottle window, button switches to Log Bottle.
- *Bottle projected at putdown.startTime* (immediately before a nap
  start, via [[putdown bottle-anchor rule]]): nap hasn't started yet
  during the bottle window, so Log Bottle is the active mode. After
  Now passes bottle.startTime + 15min, button switches to End Nap
  (which by then coincides with putdown ending and the actual nap
  starting).

Replaces every "Start X Now" dashboard button removed under
[[Now-cross promotion]]. Drawer remains the manual path for any
bottle outside the ±15min window.

Established 2026-05-26 (§F66 button-design grill).

## putdown bottle-anchor rule

If a projected bottle's cascade-computed time falls anywhere in the
range `[parent.startTime - putdownLeadMinutes, parent.startTime + napLen/2]`
for an adjacent projected nap or bedtime, the bottle's projected time
snaps to `parent.startTime - putdownLeadMinutes` (the start of
putdown).

Mid-wake-window bottles outside this range still use plain interval
cascade.

Putdown rendering does not change. Bottle chip visuals do not change
— only timeline position. Bottle and putdown live on different lanes
so they don't collide.

Resolves §F66 dogfood issue #6f.

This rule is subject to the [[no-past-projections invariant]]: if
snapping the bottle to `parent.startTime - putdownLeadMinutes` would
land in the past (i.e., already ≤ Now), the putdown-anchor is
skipped and the bottle falls through to the next-valid-future-slot
calculation.

Established 2026-05-25 (§F66 grill). Past-projection precedence added
2026-05-26.

## no-past-projections invariant

A cascade-computed projection's time must always be `> Now`. Reality
wins: if the natural calculation (including [[putdown bottle-anchor
rule]] snap-out-of-nap, cascade interval, etc.) would place a
projection at a time already in the past, the engine instead moves
the projection to the **nearest future time that obeys all other
projection rules** (not inside an active nap, not before another
recorded event, respecting min-interval, etc.).

**Why**: A "projection" is by definition a forecast. A forecast at a
time already past would (a) auto-promote to recorded via Now-cross,
which falsely claims a happened-fact that the engine just invented,
and (b) destabilize the cascade — a recomputation could retroactively
"create" past events that never existed.

**Scope**: all projected event types — bottles, naps, bedtime,
putdown render.

**Concrete example**: nap projected 12:00–12:45 with a post-nap
bottle projected at 12:45. User logs nap start as 12:20 (20-min
putdown delay). Cascade re-runs: nap is now 12:20–1:05; the bottle
would snap to first-half-of-nap → putdown.startTime = 12:05; but
Now = 12:30. The 12:05 placement violates the invariant; the engine
moves the bottle to nap.endTime (1:05) — the next valid future slot.

Established 2026-05-26 (§F66 button-design grill).

## bedtimeThreshold

The latest time a *projected* nap is allowed to end. If cascade
produces a nap whose `endTime > bedtimeThreshold`, the nap is
**dropped** entirely.

Default to be set lower than today's value — proposed default 5:30pm
(today's default of 7:00pm was the trigger for §F64's 4:46pm bedtime
bug).

Does NOT apply to *recorded* naps (reality wins — if baby actually
napped past threshold, the nap stays).

Established 2026-05-25 (§F66 grill).

## earliestBedtime

The floor for *projected* bedtime startTime. Engine never projects
bedtime before this time.

Proposed default 6:00pm.

`bedtime.startTime = max(earliestBedtime, lastNapEnd + WW)`. The
`earliestBedtime` floor stretches the last wake window when the
cascade would otherwise place bedtime too early.

Recorded bedtime ignores the floor (reality wins).

Established 2026-05-25 (§F66 grill).

## future-event drawer rule

When the user opens the drawer on a *future projected* event:

- **Owner** is editable (planning intent).
- **Time** and **amount** fields are read-only or hidden.

Reason: future events can't have happened yet, so claiming a time or
amount for them would create the same "pinned" override that produced
§F64 and issue #4. The only way to shift projected time is via
settings (bedtimeThreshold, earliestBedtime, wake-window durations,
bottle interval, etc.) and via reality (recording actuals).

Established 2026-05-25 (§F66 grill).

## dream feed

A special bottle anchored to a `dreamFeedTime` setting (e.g. 11pm).

- Counts toward `bottlesPerDay`.
- Subject to the Now-cross auto-promote rule like any bottle: when
  Now crosses `dreamFeedTime`, it auto-records at the setting time +
  default amount.
- If baby wakes and is fed before `dreamFeedTime`, the actual
  recorded feed becomes the cascade anchor; the dream feed slot can
  be deleted via the drawer (or stays unfulfilled).

Resolves §F58 / §F66 dogfood issue #1.

Established 2026-05-25 (§F66 grill).

## happened-fact

Shorthand for "a time or amount has been committed to this event AND
the resulting time is past Now." Only happened-facts promote
lifecycle to `recorded` or `completed`.

Edit-into-the-future rule: editing a previously-recorded event's time
*forward* past Now means the user is saying "actually it didn't
happen yet" — the event reverts to projected + planning intent.

Established 2026-05-25 (§F66 grill).
