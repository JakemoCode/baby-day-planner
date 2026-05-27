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

**Layer placement** (per [ADR-0006](docs/adr/0006-now-cross-and-no-retroactive-shift.md)):
runs at the engine layer, after cascade convergence, before sort and
return. Downstream cascade rules see past-now events as `recorded` and
use them only to inform remaining projections — never re-project them.
(Originally `F66_PLAN.md` placed this in `renderProjection`; ADR-0006
moves it to the engine.)

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
for an adjacent nap or bedtime (projected OR recorded), the bottle's
projected time snaps to `parent.startTime - putdownLeadMinutes` (the
start of putdown).

For recorded naps, `napLen` is the nap's actual duration
(`endTime - startTime`); for projected naps it's the default. Per
Jake's framing (2026-05-26): "any projected bottle must snap to
either the beginning of putdown or the end of the nap" — snapping
to nap.startTime itself would misrepresent the bottle's start time
(the bottle BEGINS at putdown.start, not at the moment baby falls
asleep). The "back half" case (proposed in `(start + napLen/2, end]`)
is handled by `snapOutOfNap`, which snaps to the nearer edge — which
will be `nap.endTime` for this region.

Mid-wake-window bottles outside this range still use plain interval
cascade.

Putdown rendering does not change. Bottle chip visuals do not change
— only timeline position. Bottle and putdown live on different lanes
so they don't collide.

Resolves §F66 dogfood issue #6f.

This rule is subject to the [[no-retroactive-shift rule]] (ADR-0006):
if snapping the bottle to `parent.startTime - putdownLeadMinutes`
would land at `time ≤ Now`, the putdown-anchor snap is **skipped**
and the bottle falls through to its cascade-natural emit time. The
engine cannot "predict that something will have happened in the past"
as a side effect of recalculation.

Established 2026-05-25 (§F66 grill). Past-time skip rule established
2026-05-26 via ADR-0006 (replacing the briefly-considered
"next-valid-future-slot" framing from the superseded ADR-0004).

## no-retroactive-shift rule

(Replaces the superseded "no-past-projections invariant" entry from
2026-05-26.) See [ADR-0006](docs/adr/0006-now-cross-and-no-retroactive-shift.md).

**The engine may not move an event from `time > Now` to `time ≤ Now`
as a result of recalculation.** "You can't predict that something
will have happened in the past."

Enforced inline by each *shifting* rule (a rule whose `produces` step
transforms an event's `startTime` based on other events or constraints,
rather than emitting at a freshly-computed natural time). The rule
checks before applying the shift: if the proposed shifted time is
`≤ Now`, the rule skips the shift and falls back to a rule-specific
default (typically: emit at cascade-natural time).

**Currently only one shifting rule exists**: the
[[putdown bottle-anchor rule]] in `bottles.ts`.

**This is distinct from [[Now-cross promotion]]**, which handles the
*other* mechanism by which an event can be at `time ≤ Now`: time
moving forward past a projection. That case auto-promotes to
`recorded`. The user accepts the "lie risk" (engine claims happened-
fact for events at past times) and reconciles by deleting via the
drawer if not actually given.

**Concrete example**: nap projected 12:00–12:45 with a post-nap
bottle projected at 12:45. User logs nap start as 12:20 (20-min
putdown delay). Cascade re-runs: nap is now 12:20–1:05. The bottle's
cascade-natural emit time is 1:05 (future, fine). Putdown-anchor
would *try* to snap it to `1:00 − 15min = 12:45`... wait, that's
future too. OK the actual problematic case: cascade emits a different
future bottle whose snap target lands at `12:05` (past Now=12:30).
The putdown-anchor's snap is skipped — bottle stays at its
cascade-natural future time. No phantom past event.

Established 2026-05-26 (ADR-0006 course-correction).

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
- **Time** and **amount** fields are read-only (disabled inputs +
  explanatory hint at the top of the drawer).

Reason: future events can't have happened yet, so claiming a time or
amount for them would create the same "pinned" override that produced
§F64 and issue #4. The only way to shift projected time is via
settings (bedtimeThreshold, earliestBedtime, wake-window durations,
bottle interval, etc.) and via reality (recording actuals).

Predicate: `isFutureProjected(event, now)` in `src/v3/lifecycle.ts` —
true iff `lifecycle.state === "projected"` AND `startTime > now`.
Boundary excluded (the moment of crossing belongs to the auto-promote
flow).

Defense-in-depth: even if the disabled inputs are bypassed, the
drawer's `handleSave` sanitizes the payload back to source values for
time/endTime/amount before dispatching. The resulting payload is
owner-only by construction, so `useDrawer.onSave` routes it through
`setOwnerOverride` (keeping the event projected) rather than
`saveEvent` (which would promote to recorded).

Established 2026-05-25 (§F66 grill). Implemented in §F66 PR 5.

## dream feed

A special projected bottle anchored to the `dreamFeedTime` setting
(default 11pm). Lives at a stable `eventKey === "bottle_dream"` so
the rhythm cascade and renumber pass can identify it without time-
window heuristics.

- Emitted by engine rule R5.5 (`src/v3/engine/rules/bottles.ts`) when
  `dreamFeedEnabled` is true. Lives outside the rhythm chain
  `[wakeTime, forwardCap)` — doesn't consume a cold-start slot, isn't
  subject to the bedtime cap, and isn't renumbered by R5.4.
- Label baked in by R5.5 ("Dream Feed"). The
  [[future-event drawer rule]] still applies — owner is editable on
  the projection; time + amount lock until Now crosses `dreamFeedTime`.
- Subject to the Now-cross auto-promote rule like any projected
  bottle (ADR-0001): when Now crosses `dreamFeedTime`, the engine
  flips it to recorded at the setting time + default amount.
- If the user records any feed after bedtime (e.g. a 22:00 wake-feed
  before the projected dream-feed at 23:00), THAT recording IS the
  dream feed for the night. R5.5 suppresses its own projection in
  that case, and the legacy render-pass `applyDreamFeedLabel`
  relabels the recorded post-bedtime bottle as "Dream Feed". Exactly
  one dream-feed chip ends up on the timeline.

Resolves §F58 / §F66 dogfood issue #1.

Established 2026-05-25 (§F66 grill). Implemented in §F66 PR 6.

## happened-fact

Shorthand for "a time or amount has been committed to this event AND
the resulting time is past Now." Only happened-facts promote
lifecycle to `recorded` or `completed`.

Edit-into-the-future rule: editing a previously-recorded event's time
*forward* past Now means the user is saying "actually it didn't
happen yet" — the event reverts to projected + planning intent.

Established 2026-05-25 (§F66 grill).
