# Domain Model — Baby Day Planning

This is the plain-English model of how babies actually behave —
the *domain* the app is trying to describe. It is **not** a spec,
**not** a list of requirements, and **not** rules for the engine.

The implementation is supposed to fit this model. If
implementation overflows the model (more abstractions than the
domain warrants), that's a signal to step back and audit
(`~/Workspace/.claude/rules/step-back.md`).

When Jake's plain-English description (sections §1–§7 below)
disagrees with the implementation, **Jake wins.** The research
notes in §8 are supporting context to round out edge cases the
app doesn't currently target — they are NOT authoritative over
Jake's lived experience.

Primary use case: **pumping mother, bottle-fed baby, ~4 months
old.** Designed with enough abstraction to also serve newborn
through ~12 months.

---

## §1 Sleep — naps, wake windows, and rhythm

Babies wake up in the morning. After they've been awake for a
while, they need a nap. After the nap they're awake again. After
being awake again, they need another nap. This wake → sleep →
wake → sleep rhythm repeats throughout the day.

Babies need roughly 16–20 hours of sleep per day for a while. As
they get older they need fewer total naps and each nap eventually
gets longer.

How long a baby can comfortably stay awake between sleeps — the
"wake window" — is biological, not chosen. It grows with age.
Wake windows are soft targets: the same baby might tolerate 90
minutes one morning and only 70 minutes the next afternoon. The
predicted nap time is a forecast, not a deadline.

**When the app projects naps**, it's making an educated guess
based on configured wake-window lengths. Recorded naps replace
those guesses with reality, and predictions for the rest of the
day adjust accordingly. The better the configured wake windows
match this particular baby, the more accurate the predictions
become.

---

## §2 Feeding — bottles, intervals, and the no-eating-during-naps rule

Babies need food at generally regular intervals. Newborns need
to be fed roughly every 2 hours. As they age, they consume more
at each feed and feeds space out further. Eventually they stop
needing overnight bottles and settle into pretty regularly-spaced
larger bottles throughout the day.

**Babies cannot eat during a nap.** This is a hard constraint,
not a heuristic. A projected bottle that would fall inside a nap
needs to either land before the nap or after it.

**Smaller bottle = hungry sooner.** If a baby took a smaller-
than-usual feed, the next hunger cue will arrive earlier than
the nominal interval. The interval-until-next-feed depends on
what was actually consumed, not on a fixed schedule.

**Pre-nap top-off.** Babies have a hard time going to sleep if
they're hungry. If it's almost (but not quite) time for the
next bottle and baby is fussy heading into a nap, parents may
offer a top-off feed. This is opportunistic, not scheduled.

**Post-nap extra hunger.** Conversely, a content baby might
take a nap easily even though they're slightly under-fed,
then wake up extra hungry because they slept slightly longer
than the nominal interval would have allowed.

**Overnight bottles.** Babies can and will wake overnight for
a bottle (sometimes several). This is normal at younger ages
and tapers off as the baby grows.

---

## §3 Bedtime — a fuzzy emergent thing, not a clock time

When babies aren't sleeping, they're awake. After being awake
long enough, they need to sleep again. At a certain point in
the evening their circadian rhythm kicks in and says "okay
baby, it's time for the longer overnight sleep." That sleep
is bedtime.

**Bedtime is not a hard-and-fast clock time.** It's a
consequence of cortisol, sleep pressure, and how the rest of
the day went. The best a parent can do is take educated
guesses as to when it will land.

As babies get older, bedtime gets more consistent — both in
timing and in the length of the overnight sleep.

For the engine, this means: the projected bedtime is a
forecast based on configured thresholds and the day's
trajectory. A nap that lands at or after the bedtime
threshold IS bedtime — there's no separate event type from
the baby's perspective; it's just the last sleep of the day.

---

## §4 Wind-down — why you can't just put a baby in a crib

When it's time for a baby to sleep, you don't simply place
them in a crib and turn the light off. Babies, for a long
time, lack any means to help themselves transition from
"awake" to "asleep." If you've heard a baby being put down
for a nap, they generally find this transition objectionable.

The fix: parents give themselves a little extra time before
the projected sleep to help baby wind down — dim the lights,
hold them quietly, swaddle, whatever this particular baby
needs. That wind-down window means baby is more relaxed and
closer to sleep when actually placed in the crib.

**Why not put them down earlier?** Because if you try to put
a baby down before they're tired, they get mad. Perfectly
reasonable response.

**Why is timing critical?** Because if you miss the sleep
window, cortisol rises. Baby becomes overtired — exhausted,
extremely irritable, frustrated they aren't asleep, but
overloaded with cortisol which actively prevents them from
sleeping. A dreadful state for everyone.

For the engine, wind-down (the app calls it "putdown") is a
brief region just before each projected nap or bedtime. The
no-eating-during-naps constraint extends backwards through
this region — you don't want to give baby a bottle in the
middle of the wind-down because it defeats the purpose.

---

## §5 Dream feed — a specific top-off for evening sleep

A dream feed is a small bottle offered to a sleeping or
drowsy baby — without fully waking them — typically 1.5–3
hours after bedtime, often around 8:30 or 9 PM in our
household. The goal is to pre-load baby's stomach so the
longest overnight stretch aligns with the parents' own
sleep window.

Dream feed is **opt-in**. Some parents feel baby is getting
enough calories without it; others use it to maximize
overnight sleep and total daily intake.

Dream feed timing is its own thing — it's not subject to the
normal bottle interval cascade. Typically:

- **No earlier than ~2 hours after the last evening bottle**
  (so the stomach has cleared enough that a top-off is
  effective).
- **Often ~1.5 hours after bedtime starts** (so baby has
  entered deep sleep and the feed doesn't disturb them).
- Once a household's schedule is stable, dream feed becomes
  basically a fixed clock time (8:30 PM, 9 PM).

For the engine: dream feed is its own thing in the bottle
projection family, with its own anchor rules. Not a member
of the regular cascade.

---

## §6 Pumping — the parent's parallel schedule

A pumping mother whose baby is bottle-fed has her own
schedule running in parallel: she needs to pump to maintain
supply, ideally on a cadence that roughly matches what baby
consumes (so output and intake stay balanced).

Typical for a 4-month-old's mother: 5–8 pumps per day,
spaced every 3–4 hours, targeting ≥120 minutes of total
pump time daily.

**The morning pump (first after the overnight gap) yields
the most.** Prolactin is elevated overnight, so the morning
pump should not be skipped.

Pump times are scheduled, not predicted from baby's events.
They live alongside the baby's schedule but don't influence
it. Owners can be assigned (which parent is responsible for
that pump session) — assigning an owner doesn't change the
timing.

---

## §7 Predictions and owners — what does and does not matter

**Educated guesses, not commandments.** Based on when things
actually happen, we can make better-and-better educated
guesses about when remaining things for the day will happen.
The better we know our baby, the more accurate the guesses.

**Reality wins.** When a recorded event disagrees with a
prediction, the prediction adjusts. The engine never "fixes"
reality.

**Owners are metadata, not biology.** Deciding in advance
who might give baby a bottle, or who watches baby while
they're awake, or who puts baby down for a nap, in
absolutely no way influences when baby will want to do
these things. Owner assignment is for adult coordination —
the baby is indifferent.

---

## §8 Reference notes — supporting context from research

The numbers below are population norms (for the rare case
the engine needs defaults for a baby it doesn't yet know).
Individual babies vary widely within these ranges. **Soft
defaults, never hard rules.**

### §8.1 Wake windows by age

| Age band | Typical wake window |
|---|---|
| 0–2 months | 45–60 min |
| 2–4 months | 60–90 min |
| **4–6 months (target)** | **90–150 min** (often 1.5–2.5 hr) |
| 6–9 months | 2–3 hr |
| 9–12 months | 2.5–4 hr |

First wake window of the day is usually shorter than later
ones.

### §8.2 Nap progression

Nap count descends 4 → 3 → 2 → 1 across the first year:

| Age band | Naps per day |
|---|---|
| 0–3 months | 4–5 |
| 3–5 months | 3–4 |
| **5–8 months** | 3, transitioning to 2 |
| 8–15 months | 2, then 1 |

Infant sleep cycles are ~30–50 min. A "short nap" is one
cycle (baby wakes at the boundary and doesn't re-link). A
full restorative nap crosses ≥2 cycles (~60–90+ min). The
4-month mark is the first major sleep disruption point —
see §8.7.

### §8.3 Bottle cadence by age (formula or pumped milk)

| Age band | Per feed | Interval |
|---|---|---|
| 0–1 month | ~2–3 oz | every 2–3 hr (8–12 feeds/day) |
| 1–3 months | ~3–4 oz | every 3 hr |
| **3–6 months (target)** | **~4–6 oz** | **every 3–4 hr** |
| 6–12 months | ~6–8 oz | every 4–5 hr (solids start) |

AAP guideline: roughly 2.5 oz/lb/day total formula, capped
~32 oz/day. Overnight feeds typically drop off between 3–6
months.

### §8.4 Smaller-bottle = sooner — why it's real

Stomach capacity at 4 months is ~4–5 oz. A 2 oz feed empties
faster than a 5 oz feed, so the next hunger cue arrives
sooner. The interval-until-next-feed resets from actual
intake, not from clock time. This justifies the
`bottleIntervalRules` lookup-by-amount in settings.

### §8.5 Bedtime emergence

A distinct, earlier "bedtime" (vs. just another nap) emerges
around 6–12 weeks as melatonin production starts and the
circadian system consolidates. By 3–4 months, evening sleep
is reliably longer and earlier (typically 6–8 PM). Bedtime
is a biological window, not a clock setting — it floats with
the day's total sleep, last nap timing, and cumulative wake
time.

### §8.6 Dream feed window

Dream feed is most useful from ~6 weeks through 5–6 months
and is commonly dropped between 4–8 months — especially once
baby consolidates overnight sleep without it. A dream feed
that stops extending sleep (or starts causing more frequent
wakings) is a signal to drop it.

### §8.7 4-month sleep regression

Around 3.5–4.5 months, infant sleep architecture
permanently matures from a two-state system (active/quiet)
toward adult-like multi-stage cycles (light/deep/REM). Each
cycle ~45–50 min, with natural partial awakenings at cycle
boundaries. Babies who haven't yet learned to re-settle
fully wake at those transitions. **This is not a temporary
regression — the new architecture is permanent.** It makes
sleep timing less predictable and short naps more common
exactly at the age this app targets.

### §8.8 Pumping schedule

Exclusively-pumping mother at 4 months: 5–8 pumps/day,
every 3–4 hours, ≥120 min total daily pump time. Target
output mirrors baby's intake: ~24–30 oz/day for a 4-month-
old (~10–14 lb). Morning pumps yield the most (overnight
prolactin). Sessions spaced >5–6 hours risk suppressing
supply.

### §8.9 Wind-down length

Typical wind-down routine is 5–20 min: dim lights, diaper
change, swaddle / sleep sack, brief soothing. The routine
is a learned cue that sleep is coming. Consistency matters
more than specific content. Overtired baby signs: arching,
frantic crying, inability to settle despite apparent
exhaustion.

### §8.10 Sources

- AAP / HealthyChildren.org — [Formula feedings amount + schedule](https://www.healthychildren.org/English/ages-stages/baby/formula-feeding/Pages/amount-and-schedule-of-formula-feedings.aspx), [How often and how much](https://www.healthychildren.org/English/ages-stages/baby/feeding-nutrition/Pages/how-often-and-how-much-should-your-baby-eat.aspx)
- Cleveland Clinic — [Wake windows by age](https://health.clevelandclinic.org/wake-windows-by-age)
- Huckleberry — [First year of sleep expectations](https://huckleberrycare.com/blog/first-year-of-sleep-expectations), [4-month-old sleep](https://huckleberrycare.com/blog/4-month-olds-and-sleep), [Dream feeding](https://huckleberrycare.com/blog/dream-feeding-how-to-dream-feed-your-baby)
- Blueberry Pediatrics — [Baby sleep cycles and milestones](https://www.blueberrypediatrics.com/health-tips/the-ultimate-guide-to-baby-sleep-cycles-and-milestones-birth-to-12-months)
- Taking Cara Babies — [The dream feed](https://www.takingcarababies.com/blogs/feeding/the-dream-feed), [Overtired baby](https://www.takingcarababies.com/blogs/sleep-basics/overtired-baby-or-toddler)
- La Leche League GB — [Exclusively expressing breastmilk](https://laleche.org.uk/exclusively-expressing-breastmilk-for-your-baby/)
- Exclusive Pumping — [Sample pumping schedules](https://exclusivepumping.com/sample-pumping-schedules/)
- Nanit — [4-month sleep schedule](https://www.nanit.com/blogs/baby-sleep-schedule/4-month-sleep-schedule-your-complete-guide-to-navigating-the-sleep-regression)
- The Bump — [4-month sleep regression](https://www.thebump.com/a/4-month-sleep-regression)
- KidsHealth / Nemours — [Formula feeding FAQs](https://kidshealth.org/en/parents/formulafeed-often.html)
- My Sweet Sleeper — [Melatonin and circadian rhythm](https://www.mysweetsleeper.com/newborninfantblog/melatoninandyourbaby)
- Little Ones — [Over/under-tiredness](https://www.littleones.co/blogs/our-blog/over-under-tiredness-your-sleep-enemies)
