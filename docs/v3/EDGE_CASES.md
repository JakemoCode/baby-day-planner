# V3 Edge Cases — Property-Test Seed Data

> Inventory of (input scenario × expected output) for V3's regression
> suite. Every entry is sourced from a fix commit on V2 main or a
> decision in `REQUIREMENTS.md`. Each row is property-test ready.

> **How to use**: V3's test suite (likely fast-check) feeds these
> scenarios as concrete examples that must hold, alongside randomly
> generated inputs. The format is intentionally machine-extractable.

> Format:
> ```
> ### EC-{ID}: <scenario name>
> - **Given**: input state
> - **When**: action
> - **Then**: expected outcome
> - **Rule(s)**: REQUIREMENTS.md ref(s)
> - **Source**: commit hash + date OR "rule-derived"
> ```

> Counts: ~120 entries. Comprehensiveness > brevity. Group by
> domain area.

---

## Naps & Wake Windows

### EC-N1: Late nap stretches preceding wake window
- **Given**: WW2 projected 09:25–11:25; settings allow 135min WW2
- **When**: actual nap_2 recorded at 13:30 (2 hours past projected end)
- **Then**: WW2 endTime = 13:30; nap_2 starts at 13:30
- **Rule(s)**: R3.5
- **Source**: 85eade2 (2026-05-07)

### EC-N2: Early nap shrinks preceding wake window
- **Given**: WW2 projected 09:25–11:25
- **When**: actual nap_2 recorded at 10:30 (55 min early)
- **Then**: WW2 endTime = 10:30; no overlap between WW2 and nap_2
- **Rule(s)**: R3.5
- **Source**: 818dd3e (2026-05-07)

### EC-N3: Nap crossing previous nap end collapses WW
- **Given**: actual nap_1 ends 09:30
- **When**: actual nap_2 starts 09:00 (data inconsistency)
- **Then**: WW2 startTime = WW2 endTime = 09:30; renders as zero-length sliver, not inverted block
- **Rule(s)**: R3.6
- **Source**: 818dd3e (2026-05-07)

### EC-N4: Manual nap overlapping projected nap is allowed
- **Given**: projected nap_3 at 13:00–13:45
- **When**: user creates manual nap with start=13:10, end=13:50 via drawer
- **Then**: drawer accepts save; engine recomputes projected nap_3 from new manual nap's endTime
- **Rule(s)**: R3.9
- **Source**: 97d7471 (2026-05-07)

### EC-N5: Drawer blocks overlap with recorded naps
- **Given**: nap_2 with `recorded: true`, range 13:00–13:45
- **When**: user creates nap with start=13:20, end=14:00 via drawer
- **Then**: drawer shows error "Overlaps Nap 2 (1:00 PM – 1:45 PM)"; save disabled
- **Rule(s)**: R3.9, R17.7
- **Source**: 818dd3e (2026-05-07), d77b739 (2026-05-07)

### EC-N6: Drawer ignores overlap against `recorded:false` annotations
- **Given**: nap_3 with status="overridden", recorded=false (owner-only edit)
- **When**: user creates new nap overlapping nap_3's stored time
- **Then**: drawer accepts save (annotation gets recomputed)
- **Rule(s)**: R3.9
- **Source**: 97d7471 (2026-05-07)

### EC-N7: Inverted endTime blocked at drawer
- **Given**: drawer for nap with start=10:00
- **When**: user sets end=09:30
- **Then**: error "Must be after start time."; save disabled
- **Rule(s)**: R3.10, R17.2
- **Source**: 818dd3e (2026-05-07)

### EC-N8: Tiny nap clamps to 24px height
- **Given**: actual nap_1 with start=09:00, end=09:01 (1 min)
- **When**: timeline renders nap_1 block
- **Then**: block height >= 24px; tappable for edit
- **Rule(s)**: R3.11
- **Source**: 85eade2 (2026-05-07)

### EC-N9: Owner-annotated projected nap doesn't pin time
- **Given**: projected nap_3 at 14:00; user opens drawer, sets owner=Daycare, saves (no time change)
- **When**: actual nap_2 then recorded at 13:00 shifting cascade
- **Then**: nap_3 cascades to new computed time (e.g. 14:30); owner=Daycare preserved
- **Rule(s)**: R3.3, R12.1
- **Source**: f17428f (2026-05-07)

### EC-N10: Recorded nap cannot be un-recorded by owner edit
- **Given**: nap_2 with recorded=true (started+ended via dashboard)
- **When**: user edits owner via drawer, no time change
- **Then**: recorded stays true; status stays "completed"
- **Rule(s)**: R1.8, R17.5
- **Source**: f17428f (2026-05-07)

### EC-N11: Short nap triggers WW shrink
- **Given**: settings.shortNapThresholdMinutes=35, shortNapAdjustmentMinutes=10
- **When**: actual nap_1 duration is 30 min (under threshold) AND recorded=true
- **Then**: WW2 length = base WW2 - 10 min
- **Rule(s)**: R3.7
- **Source**: rule-derived

### EC-N12: Unrecorded short-duration nap doesn't trigger WW shrink
- **Given**: nap_1 with stored duration 30 min but recorded=false
- **When**: WW2 length is computed
- **Then**: WW2 = base length (no adjustment)
- **Rule(s)**: R3.8
- **Source**: rule-derived

### EC-N13: Block label shows "Nap 2 (42 min)"
- **Given**: nap_2 with start=13:00, end=13:42
- **When**: timeline renders nap_2 block
- **Then**: label = "Nap 2 (42 min)"
- **Rule(s)**: R3.12
- **Source**: f17428f (2026-05-07)

### EC-N14: In-progress nap shows label without duration
- **Given**: nap_1 with start=09:00, no endTime
- **When**: timeline renders nap_1 block
- **Then**: label = "Nap 1" (no min suffix)
- **Rule(s)**: R3.12
- **Source**: f17428f (2026-05-07)

### EC-N15: Short nap collapses to single-row layout
- **Given**: nap_3 with naturalHeight < 50px
- **When**: timeline renders block
- **Then**: owner inline with label, range row dropped
- **Rule(s)**: R3.13
- **Source**: f17428f (2026-05-07)

### EC-N16: Wake event coinciding with WW1 start is filtered
- **Given**: WW1 starts at 07:00; "wake" event also at 07:00
- **When**: timeline renders
- **Then**: only WW1 block renders; wake instant chip is suppressed
- **Rule(s)**: R16.8
- **Source**: rule-derived

### EC-N17: Wake window owner is template-driven, NOT nap-derived (revised)
- **Given**: template.napOwners=[Kelly, Jake]; template.wakeWindowOwners=[parent2, parent1]
- **When**: applyTemplate runs on projected WW2
- **Then**: WW2.owner = parent1 (from wakeWindowOwners[1], NOT nap_2's owner)
- **Rule(s)**: R4.1, R12.3 (revised in Jake review 1)
- **Source**: rule-derived (V3)

### EC-N17b: Wake window with no template owner has no owner
- **Given**: no template; projected WW2
- **When**: applyTemplate runs
- **Then**: WW2.owner is unset (renders without owner stripe)
- **Rule(s)**: R4.1, R12.3
- **Source**: rule-derived

### EC-N18: Wake window override carries metadata only, not time
- **Given**: manual ww_2 override stored from days ago with stale time
- **When**: cascade runs and recomputes WW2 time
- **Then**: WW2 displays cascade time + override's owner/label
- **Rule(s)**: R4.2
- **Source**: 4d09576 (2026-05-07)

### EC-N19: Cleared owner on manual ww persists
- **Given**: manual ww_2 with owner cleared (undefined)
- **When**: applyTemplate runs
- **Then**: ww_2 stays without owner (template doesn't re-stamp)
- **Rule(s)**: R12.7
- **Source**: 4d09576 (2026-05-07)

---

## Bottles

### EC-B1: Bottle chain anchors latest-by-time recorded
- **Given**: actuals contain bottle_1 (07:00), bottle_2 (10:00), bottle_3 (13:00)
- **When**: projectBottleChain runs
- **Then**: cursor = bottle_3.startTime; subsequent projected bottles cascade from 13:00
- **Rule(s)**: R5.1
- **Source**: rule-derived

### EC-B2: Stray higher-index manual bottle anchored on max key
- **Given**: actuals contain bottle_1, bottle_2, bottle_4 (manual at 12:00), bottle_3 (actual at 14:00)
- **When**: projectBottleChain runs
- **Then**: next projected eventKey = bottle_5 (not bottle_4 which would duplicate)
- **Rule(s)**: R5.3
- **Source**: 9893f60 (2026-05-07)

### EC-B3: Bottles renumber chronologically for display
- **Given**: actuals as in EC-B2, projection runs
- **When**: timeline renders
- **Then**: chips display "Bottle 1, Bottle 2, Bottle 3, Bottle 4, Bottle 5" in chronological order
- **Rule(s)**: R5.4
- **Source**: b1ef541 (2026-05-07)

### EC-B4: Renumber doesn't change Firestore eventKeys
- **Given**: bottle_4 manual at 12:00, bottle_3 actual at 14:00
- **When**: projection completes
- **Then**: in-memory display shows them as Bottle 3 / Bottle 4; Firestore docs still have original eventKeys
- **Rule(s)**: R5.5
- **Source**: b1ef541 (2026-05-07)

### EC-B5: Bottle inside nap moves to nearer edge
- **Given**: projected bottle at 13:30; nap at 13:00–14:00
- **When**: resolveBottleNapOverlap runs
- **Then**: bottle moves to 13:00 (closer than 14:00 from 13:30)
- **Rule(s)**: R5.6
- **Source**: rule-derived

### EC-B6: Bottle moves to far edge if near edge is past
- **Given**: nowMinutes=14:30; projected bottle at 14:50; nap at 14:30–15:30
- **When**: resolveBottleNapOverlap runs
- **Then**: bottle moves to 15:30 (near edge 14:30 < now)
- **Rule(s)**: R5.6
- **Source**: rule-derived

### EC-B7: Bottle overlap resolution iterates to fixed point
- **Given**: projected bottles at 13:30 and 14:30; naps at 13:00–14:00 and 14:30–15:30
- **When**: resolveBottleNapOverlap runs
- **Then**: bottle 1 moves out of nap 1, cascade pushes bottle 2 into nap 2, second pass moves bottle 2 out of nap 2; converges
- **Rule(s)**: R5.7
- **Source**: 9893f60 (2026-05-07)

### EC-B8: Projected bottle past `bottleChain.latestProjectedStart` is suppressed
- **Given**: bottleChain.latestProjectedStart=19:00; projected bottle at 19:30
- **When**: cascade runs
- **Then**: bottle removed from event list
- **Rule(s)**: R5.8 (revised)
- **Source**: rule-derived (V3)

### EC-B9: Recorded bottle past suppression cap is preserved
- **Given**: bottleChain.latestProjectedStart=19:00; recorded bottle at 03:00 (overnight feed)
- **When**: cascade runs
- **Then**: bottle stays in event list
- **Rule(s)**: R5.9 (revised)
- **Source**: rule-derived (V3)

### EC-B10: Overnight bottles project when `latestProjectedStart` extends past midnight
- **Given**: bottleChain={maxBottlesPerDay: 8, latestProjectedStart: "30:00"}; last recorded bottle at 22:00 with 4-hour interval
- **When**: cascade runs
- **Then**: projected bottles at 02:00 and 06:00 included in event list
- **Rule(s)**: R5.8
- **Source**: rule-derived (V3)

### EC-B10b: Bottle count cap stops emission even before time cap
- **Given**: maxBottlesPerDay=4; user has logged 4 bottles; cascade would emit a 5th
- **When**: cascade runs
- **Then**: chain breaks; no 5th bottle emitted
- **Rule(s)**: R5.12
- **Source**: rule-derived (V3)

### EC-B11: Narrowest bottle rule wins
- **Given**: rules `[{0–5.5: 150}, {5.6+: 180}, {0–6: 165}]`; bottle amount=5.5oz
- **When**: intervalForAmount runs
- **Then**: returns 150 (narrowest range matching 5.5)
- **Rule(s)**: R5.2
- **Source**: rule-derived

### EC-B12: Open-ended rule is lowest priority
- **Given**: rules `[{0–5.5: 150}, {5.6+: 180}]`; bottle amount=5.0oz
- **When**: intervalForAmount runs
- **Then**: returns 150 (closed range wins over open)
- **Rule(s)**: R5.2
- **Source**: rule-derived

### EC-B13: No matching rule returns fallback interval
- **Given**: rules `[{0–4: 120}]`; bottle amount=5.5oz; default=180
- **When**: intervalForAmount runs
- **Then**: returns 180
- **Rule(s)**: R5.2
- **Source**: rule-derived

### EC-B14: Undefined amount returns fallback interval
- **Given**: bottle without amountOz
- **When**: intervalForAmount runs
- **Then**: returns settings.defaultBottleIntervalMinutes
- **Rule(s)**: R5.2
- **Source**: rule-derived

### EC-B15: Start Bottle Now within minBottleIntervalMinutes triggers confirm
- **Given**: last recorded bottle at 12:00; now=12:15; minBottleIntervalMinutes=20
- **When**: user taps Start Bottle Now
- **Then**: confirm dialog appears; user must approve
- **Rule(s)**: R5.11
- **Source**: c96bbce (2026-05-06)

### EC-B16: Bottle eventKey collisions handled by id
- **Given**: user taps Start Bottle Now twice rapidly (race condition)
- **When**: createOptimistic fires
- **Then**: each doc has unique id (Date.now() suffix); same eventKey okay
- **Rule(s)**: R1.1
- **Source**: rule-derived

---

## Bedtime

### EC-BD1: Bedtime renders as block (not chip)
- **Given**: projected bedtime at 19:00
- **When**: deriveKind runs
- **Then**: kind = "block"
- **Rule(s)**: R7.1, R1.3
- **Source**: 2956795 (2026-05-07)

### EC-BD2: Projected bedtime endTime = settings.defaultWakeTime + 24h
- **Given**: settings.defaultWakeTime="07:00"; applyBedtime substitutes nap_4 with bedtime
- **When**: bedtime emitted
- **Then**: bedtime.endTime = "31:00" (7 AM next day)
- **Rule(s)**: R7.1 (revised)
- **Source**: rule-derived (V3)

### EC-BD3: Manual bedtime override replaces projection
- **Given**: actuals contain bedtime (manual) at 18:30; settings.bedtimeThreshold=19:00
- **When**: applyBedtime runs
- **Then**: only the manual bedtime appears; no projected bedtime
- **Rule(s)**: R7.2
- **Source**: 7313ca9 (2026-05-06)

### EC-BD4: Manual bedtime without endTime backfilled from defaultWakeTime
- **Given**: settings.defaultWakeTime="07:00"; user creates manual bedtime at 18:30 with no endTime
- **When**: applyBedtime processes
- **Then**: result has bedtime.endTime = "31:00"
- **Rule(s)**: R7.3, R7.1
- **Source**: rule-derived (V3)

### EC-BD5: Nap starting at bedtime is dropped
- **Given**: bedtime=19:00; projected nap at 19:00
- **When**: applyBedtime runs
- **Then**: nap removed from list
- **Rule(s)**: R7.4
- **Source**: rule-derived

### EC-BD6: Nap crossing bedtime is dropped (not clipped)
- **Given**: bedtime=19:00; projected nap at 18:30–19:30
- **When**: applyBedtime runs
- **Then**: nap removed entirely
- **Rule(s)**: R7.5
- **Source**: 6ba1689 (2026-05-06)

### EC-BD7: Bedtime starts at preceding WW's natural end (revised; V2 behavior reversed)
- **Given**: cascade puts WW3 at 16:30–19:00 (its natural end); bedtimeThreshold=19:00 triggers bedtime
- **When**: applyBedtime runs
- **Then**: WW3.endTime stays 19:00; bedtime.startTime = 19:00 (WW's natural end). WW is NOT shortened to fit a fixed bedtime time.
- **Rule(s)**: R7.6 (revised)
- **Source**: rule-derived (V3)

### EC-BD7b: Bedtime threshold acts as a trigger when WW's natural end exceeds it
- **Given**: cascade puts WW4 at 16:30–20:30 (natural); bedtimeThreshold=19:00
- **When**: applyBedtime runs
- **Then**: bedtime triggered at the next nap's projected start; WW4's natural end is preserved (not artificially clipped to 19:00)
- **Rule(s)**: R7.6
- **Source**: rule-derived (V3)

### EC-BD8: WW starting at/after bedtime is dropped
- **Given**: bedtime=18:30; WW4 at 19:00–20:00
- **When**: applyBedtime runs
- **Then**: WW4 removed entirely
- **Rule(s)**: R7.7
- **Source**: rule-derived

### EC-BD9: WW leading into dropped nap stretches to bedtime
- **Given**: manual bedtime=18:45; projected WW4 at 16:30–18:25; nap_4 at 18:25–19:25 (crosses bedtime, dropped)
- **When**: applyBedtime runs
- **Then**: WW4.endTime = 18:45 (stretched to close gap before bedtime)
- **Rule(s)**: R7.8
- **Source**: 2956795 (2026-05-07)

### EC-BD10: Bedtime z-order = nap (paints over wake_window)
- **Given**: WW3 ends 18:30; bedtime starts 18:30
- **When**: timeline renders
- **Then**: bedtime block paints above WW3 at the boundary
- **Rule(s)**: R6.6, R16.12
- **Source**: 2956795 (2026-05-07)

### EC-BD11: Threshold-triggered bedtime takes nap's startTime
- **Given**: settings.bedtimeThreshold=19:00; first nap at/after threshold is nap_4 at 19:30
- **When**: applyBedtime runs
- **Then**: bedtime.startTime = 19:30 (nap_4's start)
- **Rule(s)**: R7.10
- **Source**: rule-derived

### EC-BD12: Bedtime owner inherits from lastNapOwner by default
- **Given**: template.napOwners=[Jake, Kelly, Daycare]; no template.bedtimeOwner
- **When**: applyTemplate runs on bedtime
- **Then**: bedtime.owner = Daycare (last napOwner)
- **Rule(s)**: R12.5
- **Source**: 700092a (2026-05-07)

### EC-BD13: Explicit template.bedtimeOwner overrides lastNapOwner
- **Given**: template.napOwners=[Jake, Kelly, Daycare]; template.bedtimeOwner=Jake
- **When**: applyTemplate runs on bedtime
- **Then**: bedtime.owner = Jake
- **Rule(s)**: R12.5
- **Source**: 700092a (2026-05-07)

---

## Putdown

### EC-P1: Every projected nap emits a putdown
- **Given**: 4 projected naps from cascade
- **When**: addPutdownEvents runs
- **Then**: 4 putdown events emitted, each ending at parent nap's start
- **Rule(s)**: R6.1
- **Source**: rule-derived

### EC-P2: Putdown duration = settings.putdownLeadMinutes
- **Given**: settings.putdownLeadMinutes=15; nap at 13:00
- **When**: putdown for nap emitted
- **Then**: putdown.startTime=12:45, endTime=13:00
- **Rule(s)**: R6.1
- **Source**: rule-derived

### EC-P3: Putdown emits for manual-source naps
- **Given**: nap_2 with source="manual" (user edited owner via drawer)
- **When**: addPutdownEvents runs
- **Then**: putdown for nap_2 still emitted
- **Rule(s)**: R6.2
- **Source**: 85eade2 (2026-05-07)

### EC-P4: Putdown emits for unrecorded annotations
- **Given**: nap_3 with status="overridden", recorded=false
- **When**: addPutdownEvents runs
- **Then**: putdown for nap_3 still emitted
- **Rule(s)**: R6.2
- **Source**: 85eade2 (2026-05-07)

### EC-P5: Bedtime emits a bedtime_putdown
- **Given**: projected bedtime at 19:00; putdownLeadMinutes=15
- **When**: addPutdownEvents runs
- **Then**: bedtime_putdown at 18:45–19:00 emitted
- **Rule(s)**: R6.1
- **Source**: rule-derived

### EC-P6: nap_N_putdown inherits napOwners[N-1]
- **Given**: template.napOwners=[Jake, Kelly]
- **When**: applyTemplate runs on nap_2_putdown
- **Then**: nap_2_putdown.owner = Kelly
- **Rule(s)**: R6.3, R12.4
- **Source**: rule-derived

### EC-P7: bedtime_putdown inherits bedtimeOwner
- **Given**: template.bedtimeOwner=Daycare
- **When**: applyTemplate runs on bedtime_putdown
- **Then**: bedtime_putdown.owner = Daycare
- **Rule(s)**: R6.3, R12.4
- **Source**: 700092a (2026-05-07)

### EC-P8: bedtime_putdown falls back to lastNapOwner
- **Given**: template.bedtimeOwner unset; napOwners=[Jake, Kelly]
- **When**: applyTemplate runs
- **Then**: bedtime_putdown.owner = Kelly
- **Rule(s)**: R6.3, R12.4, R12.5
- **Source**: 700092a (2026-05-07)

### EC-P9: Putdown block uses single-row layout
- **Given**: putdown block with start, end, owner
- **When**: timeline renders
- **Then**: label "Putdown · 1:05p" inline; owner appended; no range row
- **Rule(s)**: R6.4
- **Source**: 08788f4 (2026-05-07)

### EC-P10: Putdown skips MIN_BLOCK_HEIGHT clamp
- **Given**: putdown with naturalHeight=30px (15 min × 2 px/min)
- **When**: timeline renders
- **Then**: block height = 30px (not clamped to 24)
- **Rule(s)**: R6.5
- **Source**: 6ba1689 (2026-05-06)

### EC-P11: Putdown stripes use low-contrast tones
- **Given**: putdown block in type-color mode
- **When**: CSS resolves background
- **Then**: alternating --color-surface-raised and --color-border (low contrast)
- **Rule(s)**: R6.7
- **Source**: 1f9547e (2026-05-07)

### EC-P12: Putdown z-order > nap > wake_window
- **Given**: WW3, nap_3, putdown_3 all overlap in some y-band
- **When**: timeline sorts blocks before render
- **Then**: render order is WW3 → nap_3 → putdown_3 (paint order)
- **Rule(s)**: R6.6, R16.12
- **Source**: rule-derived

---

## Dream Feed

### EC-DF1: Dream feed disabled => no event
- **Given**: settings.dreamFeed.enabled=false
- **When**: addDreamFeed runs
- **Then**: no dream_feed event in output
- **Rule(s)**: R8.1
- **Source**: rule-derived

### EC-DF2: Dream feed without bedtime => no event
- **Given**: dreamFeed enabled; no bedtime in events
- **When**: addDreamFeed runs
- **Then**: no dream_feed emitted
- **Rule(s)**: R8.2
- **Source**: rule-derived

### EC-DF3: Manual dream feed override replaces projection
- **Given**: actuals contain dream_feed (manual) at 21:30; settings would project 22:00
- **When**: addDreamFeed runs
- **Then**: only the manual dream_feed appears
- **Rule(s)**: R8.4
- **Source**: b1ef541 (2026-05-07)

### EC-DF4: Manual dream feed preserves owner
- **Given**: actuals contain dream_feed with owner=Kelly
- **When**: addDreamFeed runs, then applyTemplate
- **Then**: result has dream_feed with owner=Kelly (not stripped or re-projected)
- **Rule(s)**: R8.4
- **Source**: b1ef541 (2026-05-07)

### EC-DF5: Dream feed time clamped to settings.latestTime
- **Given**: bedtime=20:00; minMinutesAfterBedtime=120; latestTime=21:00
- **When**: addDreamFeed runs
- **Then**: dream_feed.startTime=21:00 (clamped; would otherwise be 22:00)
- **Rule(s)**: R8.3
- **Source**: rule-derived

### EC-DF6: Dream feed time uses settings.earliestTime as floor
- **Given**: bedtime=18:00; minMinutesAfterBedtime=60; earliestTime=20:30
- **When**: addDreamFeed runs
- **Then**: dream_feed.startTime=20:30 (earliestTime wins over bedtime+60=19:00)
- **Rule(s)**: R8.3
- **Source**: rule-derived

### EC-DF7: Dream feed chip label is "Dream Feed"
- **Given**: dream_feed event
- **When**: timeline chip renders
- **Then**: label = "Dream Feed" (not "Pump")
- **Rule(s)**: R8.6, R16.15
- **Source**: 9893f60 (2026-05-07)

### EC-DF8: Drawer shows owner picker for dream_feed
- **Given**: user opens drawer for dream_feed event
- **When**: form renders
- **Then**: OwnerPicker component visible
- **Rule(s)**: R8.7, R17.1
- **Source**: 700092a (2026-05-07)

---

## Pumps

### EC-PU1: Pumps emit from settings.pumpTimes
- **Given**: settings.pumpTimes=["10:30", "14:30"]
- **When**: mergePumpsAndExtras runs
- **Then**: two projected pump events emitted (one per time)
- **Rule(s)**: R9.1
- **Source**: rule-derived

### EC-PU2: First pump anchors to wakeTime
- **Given**: day.wakeTime=07:15; pumpTimes=["10:30", "14:30"]
- **When**: mergePumpsAndExtras runs
- **Then**: first pump emitted at 07:15 (replacing 10:30); second at 14:30
- **Rule(s)**: R9.3
- **Source**: c96bbce (2026-05-06)

### EC-PU3: No wakeTime => pumps use original times
- **Given**: day.wakeTime undefined; pumpTimes=["10:30", "14:30"]
- **When**: mergePumpsAndExtras runs
- **Then**: pumps at 10:30 and 14:30
- **Rule(s)**: R9.3
- **Source**: rule-derived

### EC-PU4: Actual pump replaces projected at same eventKey
- **Given**: settings emits pump_07:00; actuals contain pump_07:00 (manual)
- **When**: mergePumpsAndExtras runs
- **Then**: only the manual pump appears for that key
- **Rule(s)**: R9.4
- **Source**: rule-derived

### EC-PU5: Pump eventKey is `pump_${HH:MM}`
- **Given**: projected pump at 10:30
- **When**: emitted
- **Then**: eventKey = "pump_10:30"
- **Rule(s)**: R9.2
- **Source**: rule-derived

---

## Custom Events (Extras)

### EC-EX1: Extra with endTime is a block
- **Given**: user creates extra with start=15:00, end=16:00, label="Friend visit"
- **When**: deriveKind runs
- **Then**: kind = "block"
- **Rule(s)**: R10.1, R1.3
- **Source**: rule-derived

### EC-EX2: Extra without endTime is an instant
- **Given**: user creates extra with start=11:30, no end, label="Doctor"
- **When**: deriveKind runs
- **Then**: kind = "instant"
- **Rule(s)**: R10.1, R1.3
- **Source**: rule-derived

### EC-EX3: Custom block anchors right (sub-block)
- **Given**: extra block at 15:00–16:00 inside WW range
- **When**: blockGeometry runs
- **Then**: leftPx = BLOCK_LEFT_INSET + CUSTOM_LEFT_EXTRA (=150 effectively)
- **Rule(s)**: R10.4, R16.6
- **Source**: rule-derived

### EC-EX4: Custom block has 1px start/end markers
- **Given**: extra block rendered
- **When**: timeline draws
- **Then**: 1px horizontal lines at top and bottom edges, extending 4px past block
- **Rule(s)**: R10.5
- **Source**: rule-derived

### EC-EX5: Extra label preserved on chip
- **Given**: extra instant with label="Doctor"
- **When**: chip renders
- **Then**: label = "Doctor" (not type-derived)
- **Rule(s)**: R10.2, R16.15
- **Source**: rule-derived

---

## Daily Recurring Events

### EC-DR1: No recurring entries => no projection
- **Given**: settings.dailyRecurring=[]
- **When**: cascade runs
- **Then**: no recurring events emitted
- **Rule(s)**: R11.1, R11.7
- **Source**: rule-derived (V3)

### EC-DR2: Enabled instant entry projects as chip
- **Given**: dailyRecurring=[{id:"cook", label:"Cook Dinner", time:"17:00", enabled:true}]
- **When**: cascade runs
- **Then**: projected extra-instant emitted with eventKey "recurring:cook", startTime "17:00", kind "instant"
- **Rule(s)**: R11.2
- **Source**: rule-derived (V3)

### EC-DR3: Enabled block entry (with duration) projects as block
- **Given**: dailyRecurring=[{id:"bath", label:"Bath", time:"18:30", durationMinutes:15, enabled:true}]
- **When**: cascade runs
- **Then**: projected extra emitted with kind "block", endTime "18:45"
- **Rule(s)**: R11.2
- **Source**: rule-derived (V3)

### EC-DR4: Multiple entries all project independently
- **Given**: dailyRecurring=[{cook,17:00,enabled}, {bath,18:30,enabled}, {pediatrician,11:00,disabled}]
- **When**: cascade runs
- **Then**: 2 events projected (cook + bath); pediatrician omitted
- **Rule(s)**: R11.4
- **Source**: rule-derived (V3)

### EC-DR5: Existing manual extra with same key suppresses projection
- **Given**: dailyRecurring includes cook (id="cook"); actuals contain extra with eventKey "recurring:cook"
- **When**: cascade runs
- **Then**: manual one wins; no duplicate
- **Rule(s)**: R11.5
- **Source**: rule-derived (V3)

### EC-DR6: Per-day suppression skips a single day's projection
- **Given**: dailyRecurring includes cook (id="cook"); day.suppressedRecurringIds=["cook"]
- **When**: cascade runs
- **Then**: cook NOT emitted today; emitted normally tomorrow
- **Rule(s)**: R11.6
- **Source**: rule-derived (V3)

### EC-DR7: V2 cookDinner migrates to dailyRecurring on read
- **Given**: legacy V2 settings doc has cookDinner={enabled:true, time:"17:00"}
- **When**: settings converter runs on read
- **Then**: result has dailyRecurring=[{id:"cook_dinner_legacy", label:"Cook Dinner", time:"17:00", enabled:true}]; cookDinner field is dropped
- **Rule(s)**: R11.7
- **Source**: rule-derived (V3)

---

## Owner Inheritance

### EC-OW1: Manual nap with cleared owner stays cleared
- **Given**: nap_2 with source="manual", owner=undefined; template.napOwners[1]=Kelly
- **When**: applyTemplate runs
- **Then**: nap_2 owner stays undefined
- **Rule(s)**: R12.1, R12.7
- **Source**: 4d09576 (2026-05-07)

### EC-OW2: Projected nap inherits napOwners[N-1]
- **Given**: nap_2 projected; napOwners=[Jake, Kelly]
- **When**: applyTemplate runs
- **Then**: nap_2.owner = Kelly
- **Rule(s)**: R12.2
- **Source**: rule-derived

### EC-OW3: Wake window owner from template's wakeWindowOwners only (revised)
- **Given**: template.napOwners=[parent1, parent2]; template.wakeWindowOwners=[parent2, parent1]
- **When**: applyTemplate runs on projected ww_2
- **Then**: ww_2.owner = parent1 (from wakeWindowOwners[1], NOT nap_2's owner)
- **Rule(s)**: R12.3 (revised)
- **Source**: rule-derived (V3)

### EC-OW4: WW with no template owner stays unset
- **Given**: template.wakeWindowOwners=[parent2]; projected ww_2 (index 1, out of array)
- **When**: applyTemplate runs
- **Then**: ww_2.owner is unset
- **Rule(s)**: R12.3
- **Source**: rule-derived (V3)

### EC-OW5: Putdown for nap_N inherits napOwners[N-1]
- **Given**: napOwners=[Jake, Kelly]
- **When**: applyTemplate runs on nap_2_putdown
- **Then**: nap_2_putdown.owner = Kelly
- **Rule(s)**: R12.4
- **Source**: rule-derived

### EC-OW6: bedtime_putdown inherits bedtime's owner (no lastNapOwner fallback in V3)
- **Given**: bedtime.owner=parent1 (from template or manual)
- **When**: applyTemplate runs on bedtime_putdown
- **Then**: bedtime_putdown.owner = parent1
- **Rule(s)**: R6.3, R12.4 (revised)
- **Source**: rule-derived (V3)

### EC-OW6b: bedtime with no template owner has no owner
- **Given**: template.bedtimeOwner unset; no manual override
- **When**: applyTemplate runs on bedtime
- **Then**: bedtime.owner unset (no fallback)
- **Rule(s)**: R12.5 (revised)
- **Source**: rule-derived (V3)

### EC-OW7: Manual bottle keeps owner
- **Given**: actual bottle_2 with owner=other:caregiver1; template.bottleOwners=[parent1, parent1]
- **When**: applyTemplate runs
- **Then**: bottle_2.owner = other:caregiver1 (preserved)
- **Rule(s)**: R12.1, R12.6
- **Source**: rule-derived

### EC-OW8: Pump owner from Settings.pumpOwnerSlot
- **Given**: settings.pumpOwnerSlot=parent2; projected pump
- **When**: applyTemplate runs
- **Then**: pump.owner = parent2 (always, unless manually overridden)
- **Rule(s)**: R12.8 (revised)
- **Source**: rule-derived (V3)

### EC-OW9: Dream feed owner = opposite of bedtime owner
- **Given**: bedtime.owner=parent1; projected dream_feed with no manual override
- **When**: applyTemplate runs
- **Then**: dream_feed.owner = parent2
- **Rule(s)**: R8.8, R12.8 (revised)
- **Source**: rule-derived (V3)

### EC-OW9b: Dream feed owner with bedtime owner=other has no default
- **Given**: bedtime.owner=other:caregiver1
- **When**: applyTemplate runs on dream_feed
- **Then**: dream_feed.owner unset (no opposite-of mapping for "other")
- **Rule(s)**: R8.8
- **Source**: rule-derived (V3)

### EC-OW10: Manual dream feed owner wins over opposite-of-bedtime
- **Given**: bedtime.owner=parent1; manual dream_feed with owner=other:caregiver1
- **When**: applyTemplate runs
- **Then**: dream_feed.owner = other:caregiver1 (manual wins)
- **Rule(s)**: R8.9, R12.1
- **Source**: rule-derived (V3)

---

## Drawer / Form Validation

### EC-DR1: End time before start time blocks save
- **Given**: drawer for nap; user sets start=10:00, end=09:30
- **When**: validation runs
- **Then**: errors.endTime = "Must be after start time."; save disabled
- **Rule(s)**: R3.10, R17.2
- **Source**: 818dd3e (2026-05-07)

### EC-DR2: End time = start time blocks save
- **Given**: drawer; start=10:00, end=10:00
- **When**: validation runs
- **Then**: errors.endTime present; save disabled
- **Rule(s)**: R3.10
- **Source**: rule-derived

### EC-DR3: Start time edit auto-fills end time (preserve duration)
- **Given**: drawer for nap with start=10:00, end=11:00 (60 min)
- **When**: user changes start to 10:30
- **Then**: end auto-updates to 11:30
- **Rule(s)**: R17.3
- **Source**: 9893f60 (2026-05-07)

### EC-DR4: Start time edit on new event defaults end to +60min
- **Given**: FAB-create nap with start=, end=
- **When**: user enters start=14:00
- **Then**: end auto-fills to 15:00
- **Rule(s)**: R17.3
- **Source**: 9893f60 (2026-05-07)

### EC-DR5: Owner cleared via picker omits field
- **Given**: nap with owner=Jake
- **When**: user picks "no owner" and saves
- **Then**: saved doc has owner field absent (not undefined)
- **Rule(s)**: R12.7, R17.6
- **Source**: 4d09576 (2026-05-07)

### EC-DR6: Drawer save of projected event with time change marks completed
- **Given**: projected nap_2 (status="projected"); user changes start time and saves
- **When**: formToEvent runs
- **Then**: status="completed", recorded=true, source="manual"
- **Rule(s)**: R2.2, R17.4
- **Source**: 9c608fd (2026-05-07)

### EC-DR7: Drawer save of projected event with owner-only change marks overridden
- **Given**: projected nap_2; user changes only owner and saves
- **When**: formToEvent runs
- **Then**: status="overridden", recorded=false, source="manual"
- **Rule(s)**: R2.2, R17.4
- **Source**: f17428f (2026-05-07)

### EC-DR8: Already-recorded event re-edit keeps recorded=true
- **Given**: nap with recorded=true; user changes only owner
- **When**: formToEvent runs
- **Then**: recorded stays true (R1.8)
- **Rule(s)**: R1.8, R17.5
- **Source**: f17428f (2026-05-07)

### EC-DR9: Validation error renders as field-level helper text
- **Given**: drawer with endTime error
- **When**: form renders
- **Then**: error text shown directly under endTime input (red, text-xs)
- **Rule(s)**: R17.2
- **Source**: 9893f60 (2026-05-07)

### EC-DR10: Overlap error formats times in 12h AM/PM
- **Given**: overlap detected with nap_3 from 13:11–13:56
- **When**: error message generated
- **Then**: "Overlaps Nap 3 (1:11 PM – 1:56 PM)"
- **Rule(s)**: R17.7
- **Source**: d77b739 (2026-05-07)

### EC-DR11: Delete button only shown for actual/manual source
- **Given**: drawer for projected event
- **When**: form renders
- **Then**: no delete button visible
- **Rule(s)**: R17.8
- **Source**: 1e6f3fc (2026-05-06)

### EC-DR12: Delete on projected event is a no-op
- **Given**: drawer for projected event; tap delete
- **When**: handler runs
- **Then**: drawer closes, no Firestore op
- **Rule(s)**: R17.8
- **Source**: 1e6f3fc (2026-05-06)

### EC-DR13: Drawer save of projected event creates fresh doc
- **Given**: projected event with id="proj-..."; user edits and saves
- **When**: createOptimistic runs
- **Then**: new doc with `manual-${Date.now()}` id, original eventKey preserved
- **Rule(s)**: rule-derived
- **Source**: 1e6f3fc (2026-05-06)

---

## Dashboard

### EC-DA1: Next nap ordinal from recorded count
- **Given**: nap_1 recorded (status="completed"), nap_2 projected
- **When**: dashboard renders
- **Then**: button shows "Start Nap" with nextNumber=2 (V2 — V3 will label "Start Nap 2")
- **Rule(s)**: R18.1
- **Source**: f17428f (2026-05-07)

### EC-DA2: Owner-edited annotation doesn't bump ordinal
- **Given**: nap_1 has only owner-only override (status="overridden", recorded=false)
- **When**: dashboard renders
- **Then**: nextNapNumber=1 (annotation doesn't count)
- **Rule(s)**: R18.1, R1.4
- **Source**: f17428f (2026-05-07)

### EC-DA3: Start+End pair counts as 1 nap
- **Given**: nap_1 has Start doc (no endTime) AND End doc (with endTime), same eventKey
- **When**: dashboard renders
- **Then**: nextNapNumber=2 (deduped by eventKey)
- **Rule(s)**: R18.1
- **Source**: fbb1687 (2026-05-07)

### EC-DA4: NextEventCard suppresses overlapping previews
- **Given**: nextEvent.type === "bottle"
- **When**: dashboard renders
- **Then**: NextBottlePreview is hidden (smart suppression)
- **Rule(s)**: R18.5
- **Source**: rule-derived

### EC-DA5: End-of-day card after bedtime threshold
- **Given**: nowMinutes >= bedtimeThreshold; no upcoming events
- **When**: dashboard mounts
- **Then**: shows EndOfDayCard
- **Rule(s)**: R18.6
- **Source**: rule-derived

### EC-DA6: Day without wakeTime shows start prompt
- **Given**: day.wakeTime is undefined
- **When**: dashboard mounts
- **Then**: shows "Start New Day" prompt; tapping creates day with wakeTime=now
- **Rule(s)**: R14.3, R14.4
- **Source**: rule-derived

### EC-DA7: useEvents skips subscription when no dayId
- **Given**: dashboard before "Start New Day" tapped (dayId="")
- **When**: useEvents mounts
- **Then**: no Firestore subscription (avoids "reserved id" error)
- **Rule(s)**: R20.4
- **Source**: 0313fd6 (2026-05-06)

---

## Timeline Display

### EC-T1: Concurrent instants fan horizontally
- **Given**: 3 instant events all at 07:00 (bottle, pump, dream_feed)
- **When**: groupInstants + cluster renders
- **Then**: all 3 in same cluster, same y; flex-direction: row
- **Rule(s)**: R16.7
- **Source**: rule-derived

### EC-T2: Hour ticks render at every visible whole hour
- **Given**: viewport spans 06:30 – 21:30
- **When**: timeline renders
- **Then**: ticks at 7A, 8A, ..., 9P
- **Rule(s)**: R16.3
- **Source**: rule-derived

### EC-T3: Hour label format is "10A" / "1P"
- **Given**: hour tick at 13:00
- **When**: label renders
- **Then**: "1P"
- **Rule(s)**: R16.3
- **Source**: 1f9547e (2026-05-07)

### EC-T4: Default viewport 7:00 – 21:00
- **Given**: empty events array
- **When**: timeline mounts
- **Then**: viewport = 06:30 – 21:30 (with 30min padding)
- **Rule(s)**: R16.4
- **Source**: rule-derived

### EC-T5: Past events dimmed when dimPast=true and nowMinutes set
- **Given**: nowMinutes=12:00; event at 11:00; dimPast=true
- **When**: timeline renders
- **Then**: event has data-past="true" attribute (CSS opacity 0.45)
- **Rule(s)**: R16.9
- **Source**: rule-derived

### EC-T6: dimPast=false on /history regardless of setting
- **Given**: settings.timelineDimPast=true; user views /history/{date}
- **When**: timeline renders
- **Then**: events NOT dimmed (hard-coded false on this surface)
- **Rule(s)**: R16.9, R16.17
- **Source**: rule-derived

### EC-T7: Now indicator pinned at axis lane width
- **Given**: AXIS_W=36; nowMinutes set
- **When**: NowBar renders
- **Then**: pill width=36px (doesn't extend into block lane)
- **Rule(s)**: R16.10
- **Source**: c8ba57e (2026-05-07)

### EC-T8: Now pill format = full AM/PM
- **Given**: nowMinutes=11:01
- **When**: pill renders
- **Then**: text = "11:01 AM"
- **Rule(s)**: R16.10
- **Source**: c8ba57e (2026-05-07)

### EC-T9: pxPerHour drives vertical scale
- **Given**: settings.timelinePxPerHour=180
- **When**: timeline renders
- **Then**: each minute = 3px (180/60)
- **Rule(s)**: R16.2
- **Source**: rule-derived

### EC-T10: 640px max desktop content width
- **Given**: viewport 1200px wide
- **When**: timeline renders
- **Then**: content centered, max-width=640px
- **Rule(s)**: R16.1
- **Source**: rule-derived

### EC-T11: Wake event @ WW1 start filtered
- **Given**: WW1 starts 07:00; "wake" instant also at 07:00
- **When**: timeline filters events
- **Then**: wake instant suppressed; only WW1 visible
- **Rule(s)**: R16.8
- **Source**: rule-derived

### EC-T12: Chip dot color = owner color (always)
- **Given**: bottle chip with owner=Kelly
- **When**: chip renders
- **Then**: dot color = --color-owner-kelly
- **Rule(s)**: R16.13 (V3 proposal)
- **Source**: rule-derived

### EC-T13: Block z-order: WW < nap=bedtime < putdown < extra
- **Given**: timeline contains WW, nap, putdown, extra at same y-band
- **When**: blocks sorted by zOrder
- **Then**: render order = WW (1), nap (2), putdown (3), extra (4)
- **Rule(s)**: R16.12
- **Source**: 2956795 (2026-05-07)

### EC-T14: Auto-scroll to now on mount
- **Given**: scrollToNowOnMount=true; nowMinutes=14:00
- **When**: timeline mounts
- **Then**: window.scrollY = position of 14:00 minus 80px padding
- **Rule(s)**: R16.10 (ref CC1)
- **Source**: rule-derived

### EC-T15: Bottle chip shows ordinal label
- **Given**: bottle chip with label "Bottle 3"
- **When**: chip renders
- **Then**: label text = "Bottle 3"
- **Rule(s)**: R16.15
- **Source**: 1f9547e (2026-05-07)

### EC-T16: Owner name as second row in chip
- **Given**: chip with owner=Daycare
- **When**: rendered
- **Then**: owner name "Daycare" left-aligned under time row, in owner color
- **Rule(s)**: R16.14
- **Source**: rule-derived

### EC-T17: Custom block has 1px edge markers
- **Given**: extra block, kind=block
- **When**: rendered
- **Then**: 1px lines at top and bottom edges
- **Rule(s)**: R10.5
- **Source**: rule-derived

---

## Day Lifecycle

### EC-L1: Start New Day archives previous active day atomically
- **Given**: existing active day; user taps Start New Day
- **When**: startNewDay transaction runs
- **Then**: old day status="archived" + archivedAt set; new day created with status="active" — both in same transaction
- **Rule(s)**: R14.1
- **Source**: rule-derived

### EC-L2: Multiple "active" days impossible by design
- **Given**: any state
- **When**: startNewDay runs
- **Then**: at most one Day with status="active" exists in Firestore
- **Rule(s)**: R14.1
- **Source**: rule-derived

### EC-L3: New day's wakeTime = current local time
- **Given**: user at 07:23 AM taps Start New Day
- **When**: startNewDay runs
- **Then**: new day.wakeTime = "07:23"
- **Rule(s)**: R14.4
- **Source**: rule-derived

---

## Engine Pipeline Ordering

### EC-PL1: applyWakeWindowOverrides BEFORE applyBedtime
- **Given**: manual ww_3 override; bedtime that would clip ww_3
- **When**: pipeline runs in correct order
- **Then**: bedtime sees the merged ww_3 (with override metadata) and clips correctly
- **Rule(s)**: R15.1
- **Source**: 4d09576 (2026-05-07)

### EC-PL2: applyTemplate runs LAST
- **Given**: manual nap with owner cleared
- **When**: pipeline runs
- **Then**: applyTemplate skips manual events (R12.1); cleared owner persists
- **Rule(s)**: R15.1, R12.1
- **Source**: 4d09576 (2026-05-07)

### EC-PL3: addPutdownEvents AFTER applyBedtime
- **Given**: nap_4 will be substituted with bedtime
- **When**: pipeline runs
- **Then**: putdown emitted for bedtime, not for the dropped nap_4
- **Rule(s)**: R15.1, R6.1
- **Source**: rule-derived

### EC-PL4: renumberBottles AFTER suppressBottlesAfterBedtime
- **Given**: bottle past bedtime; bottles before bedtime
- **When**: pipeline runs
- **Then**: renumbering canonicalizes only the surviving bottles; final list is monotonic
- **Rule(s)**: R15.1, R5.4
- **Source**: rule-derived

### EC-PL5: Same input always produces same output (purity)
- **Given**: any (day, settings, actuals, template, nowMinutes)
- **When**: projectDay runs N times with the same input
- **Then**: outputs are identical (deep-equal)
- **Rule(s)**: R15.3, CC2
- **Source**: rule-derived

---

## Schema & Persistence

### EC-S1: Legacy doc without `kind` coerced on read
- **Given**: Firestore doc missing the `kind` field
- **When**: eventConverter.fromFirestore runs
- **Then**: doc returned with `kind` populated via deriveKind
- **Rule(s)**: R1.3, R20.3
- **Source**: rule-derived

### EC-S2: Legacy doc without `recorded` coerced on read
- **Given**: Firestore doc missing `recorded`
- **When**: eventConverter.fromFirestore runs
- **Then**: doc has `recorded` populated via deriveRecorded
- **Rule(s)**: R1.4, R20.3
- **Source**: rule-derived

### EC-S3: Engine writes always include `kind` and `recorded`
- **Given**: any new event being written via createEvent
- **When**: eventConverter.toFirestore runs
- **Then**: stored doc has both fields explicitly set
- **Rule(s)**: R20.3
- **Source**: rule-derived

### EC-S4: Optimistic update commits to UI before Firestore confirms
- **Given**: user taps Start Bottle Now
- **When**: createOptimistic runs
- **Then**: UI immediately shows new bottle (local state); Firestore write fires async
- **Rule(s)**: R20.1
- **Source**: rule-derived

---

## Settings & Defaults

### EC-SE1: Settings missing => first-run defaults rendered
- **Given**: no Settings doc in Firestore
- **When**: SettingsPage mounts
- **Then**: defaultSettings(childId) values populate the form
- **Rule(s)**: R19.2
- **Source**: rule-derived

### EC-SE2: Duration input accepts H:MM format
- **Given**: input expects minutes; user types "1:25"
- **When**: parsed
- **Then**: stored as 85 minutes
- **Rule(s)**: R19.4
- **Source**: 4ad2899 (2026-05-06)

### EC-SE3: Duration input accepts bare number as minutes
- **Given**: input expects minutes; user types "85"
- **When**: parsed
- **Then**: stored as 85 minutes
- **Rule(s)**: R19.4
- **Source**: 4ad2899 (2026-05-06)

### EC-SE4: Duration input displays H:MM
- **Given**: stored value 85
- **When**: input renders
- **Then**: shows "1:25"
- **Rule(s)**: R19.4
- **Source**: 4ad2899 (2026-05-06)

---

## Cross-cutting

### EC-CC1: Engine produces output under 50ms for typical day
- **Given**: typical day with ~100 events
- **When**: projectDay runs
- **Then**: completes in < 50ms
- **Rule(s)**: CC1
- **Source**: rule-derived

### EC-CC2: Display vs storage decoupled
- **Given**: bottles renumbered for display
- **When**: result returned
- **Then**: in-memory eventKey differs from Firestore eventKey on the same doc id
- **Rule(s)**: R5.5, CC3
- **Source**: rule-derived

---

## Known V2 bugs PUNTED (V3 must address)

### EC-PUNT1: Per-day suppression of recurring projections
- **Given**: settings.cookDinner.enabled=true; user wants to skip dinner today only
- **When**: ???
- **Then**: cook_dinner doesn't appear today; still appears subsequent days
- **Rule(s)**: R11.5
- **Source**: V2 deferred; V3 must decide

### EC-PUNT2: Concurrent same-second events
- **Given**: two events created with the same `Date.now()` (rare but possible)
- **When**: createOptimistic runs both
- **Then**: stable rendering order (V2 has undefined order)
- **Rule(s)**: rule-derived
- **Source**: V2 deferred

### EC-PUNT3: Race on double Start New Day
- **Given**: user double-taps Start New Day
- **When**: both transactions race
- **Then**: only one new day created, one transaction aborts gracefully
- **Rule(s)**: R14.1
- **Source**: V2 deferred

---

## Coverage Summary

- Naps & wake windows: 19 cases
- Bottles: 16 cases
- Bedtime: 13 cases
- Putdown: 12 cases
- Dream feed: 8 cases
- Pumps: 5 cases
- Custom events: 5 cases
- Cook dinner: 3 cases
- Owner inheritance: 9 cases
- Drawer / form validation: 13 cases
- Dashboard: 7 cases
- Timeline display: 17 cases
- Day lifecycle: 3 cases
- Pipeline ordering: 5 cases
- Schema / persistence: 4 cases
- Settings: 4 cases
- Cross-cutting: 2 cases
- Punted: 3 cases

**Total: 148 cases.** All property-test ready. Rules they enforce
referenced from `REQUIREMENTS.md`.

---

## Source References

- V2 source code as of `main` (2026-05-07).
- Git fix history: 32 fix commits between 2026-05-02 and 2026-05-07.
- Locked decisions: `~/.claude/projects/.../memory/project_decisions.md`.
- Rules they enforce: `docs/v3/REQUIREMENTS.md`.
- Architecture they will be tested against: `docs/v3/ARCHITECTURE_V3.md`.

---

## Review Log

### Review 1 (Jake, 2026-05-08) — Synced with REQUIREMENTS.md changes

- **EC-N17**: revised — wake window owner from template only
  (no nap inheritance).
- **EC-B8/B9/B10**: revised — overnight bottles supported via
  `bottleChain.{maxBottlesPerDay, latestProjectedStart}`.
- **EC-BD2/BD4**: revised — bedtime endTime from
  `settings.defaultWakeTime + 24h`.
- **EC-BD7**: revised — bedtime starts at WW's natural end; WW NOT
  shortened to fit a fixed bedtime time. EC-BD7b added.
- **EC-CD1–CD3 → EC-DR1–DR7**: replaced — Cook Dinner generalized to
  Daily Recurring Events with multiple entries, optional duration,
  per-day suppression, V2 migration on read.
- **EC-OW3/OW4**: revised — wake window owner template-driven, no
  fallback to nap owner.
- **EC-OW6/OW6b**: revised — bedtime + bedtime_putdown owner
  template-driven only; no lastNapOwner fallback.
- **EC-OW8**: revised — pump owner from `Settings.pumpOwnerSlot`.
- **EC-OW9/OW9b/OW10**: revised — dream feed owner = opposite of
  bedtime owner; explicit "other" handling; manual override wins.
