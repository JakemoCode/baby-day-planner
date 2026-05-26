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
- **In-progress carve-out**: while start ≤ Now < end, an "End Nap Now"
  button (the only surviving dashboard action) closes the nap by
  setting endTime = Now. Visible only during an in-progress nap.
- **Honesty mechanic**: if an event didn't actually happen, user
  deletes it via the drawer. If it ran longer than projected, user
  edits the relevant time forward (which, per the edit-into-future
  rule, may revert it to projected planning intent depending on
  where the new time lands).

Replaces: NapActionButton "Start Nap Now," "Start Bedtime Now,"
"Start Bottle Now," dashboard CTAs of the action-button kind.

Established 2026-05-25 (§F66 grill).

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

Established 2026-05-25 (§F66 grill).

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
