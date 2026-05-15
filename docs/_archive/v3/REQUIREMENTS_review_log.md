# V3 Requirements — Review Log (Historical)

> This file contains the verbatim review log extracted from the bottom of
> `docs/v3/REQUIREMENTS.md` before it was archived. For the current state
> of the domain rules, see [`docs/v3/ENGINE_SPEC.md`](../../v3/ENGINE_SPEC.md),
> [`docs/v3/DATA_MODEL.md`](../../v3/DATA_MODEL.md), and
> [`docs/v3/RENDER_SPEC.md`](../../v3/RENDER_SPEC.md).

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
