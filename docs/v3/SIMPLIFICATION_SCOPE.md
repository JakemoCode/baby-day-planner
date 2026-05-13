# V3 Engine Simplification — Scope

Lightweight blueprint for collapsing the V3 engine from ~179 numbered
rules to ~5-7 scheduling rules + clearly-separated render/UX/data-model
concerns. Intentionally not a rewrite of `REQUIREMENTS.md` — that
follows once the engine actually matches this scope.

This doc is the spec for the incremental simplification work
(the bottle-cascade PR onward). If we discover during implementation that the
scope is wrong, we update this doc, not the code-to-be-written.

---

## §1 Why simplify

The engine grew organically. REQUIREMENTS.md currently has 179
numbered rules across 22 sections — but the underlying domain
(baby behavior) is ~5-6 paragraphs of plain English. The
discrepancy comes from three sources:

1. **Render / UX concerns** documented as engine rules (chip
   placement, color tints, dim-past, tap target sizes, inline
   duration display).
2. **Tautological consequences** of "reality wins + sequential
   cascade from real time" — each spelled out as its own rule
   with its own match/produce/tests (wake-window stretch/shrink,
   inverted-nap WW collapse, R5.7 fixed-point convergence).
3. **Bottle rules expressed as a multi-pass system** (grid +
   independent nudges) instead of one sequential cascade.

The schema, lifecycle discriminated union, and rule-registry +
topo-sorted-evaluator architecture are all correct. **None of
that changes.** What collapses is rule count.

---

## §2 Target rule set

After simplification, the engine should have approximately:

### §2.1 Scheduling rules (these produce event times)

| Rule | Replaces | What it does |
|---|---|---|
| **Sleep cascade** | R3.1, R3.5, R3.6, R3.7-3.8, R4.3-R4.4, parts of R7 | One sequential rule: `nap_N.start = prev_event.end + wakeWindowsMinutes[N-1]`. Short-nap adjustment is one branch. If a projected nap's start ≥ `bedtimeThreshold`, it's relabeled as bedtime instead. Reality wins — anchors read previous event's actual rendered time. |
| **Bottle cascade** | R5.1, R5.6, R5.7, R5.11 | Sequential, anchored at `wake + buffer` (no prior bottles) OR earliest non-projected bottle **with `startTime >= wakeTime`** (overnight bottles don't anchor — see midnight rule below). Each step `= prev.startTime + intervalForAmount(prev.amountOz)`. If the proposed time lands inside `[nap.start, nap.end]`, snap to nearest edge with the "nowMinutes" fallback. **The no-feed region is the nap itself only — NOT extended backward through putdown** (wind-down is render-only; a bottle can BE the wind-down). **Stops at midnight (`1440`), not `tomorrowWake` — bottles past midnight belong to the next calendar day's chain.** |
| **Bottle bidirectional backfill** | (no current equivalent — bug §F19/§F21) | Same cascade, applied backwards from earliest non-projected anchor. Fills slots before the anchor while remaining `≥ wake + buffer`. |
| **Scheduled recurring events** | R8 (dream feed), R9 (pumps), R11 (daily recurring), R21 (daycare) | One rule family for "events at a fixed time per day (or per weekday)." Each entry has `time`, optional `weekdays` filter, opt-in flag, optional `minGapAfterLastBottle` heuristic for dream-feed fallback (see §3). |

### §2.2 Derived views (NOT rules — read-only projections)

| View | Replaces | What it is |
|---|---|---|
| **Wake windows** | R4.1, R4.2, R4.4 | `WW_N = (prev_nap.end, next_nap.start)`. Computed at render time, never an engine rule. Owner annotation lives on `wakeWindowOverride` docs. |
| **Putdown** | R6.* | `putdown_N = [nap_N.start - putdownLead, nap_N.start]`. Pure render-time derive. Engine never emits a `putdown` event. The bottle cascade reads `[putdown..nap.end]` as a no-feed region. |

### §2.3 Invariants (not rules, but enforced)

- **Reality wins**: any event with `lifecycle.state ∈ {started, completed}` is never moved or removed by the engine.
- **User commitment wins**: any `overridden` event anchors cascades just like a recorded one (predict-don't-prescribe).
- **Owners are scheduling-inert**: assigning an owner to an event never changes when it happens. Owner default lives in templates/settings, never engine.
- **R5.4 (chronological renumbering)** stays — it's display-only but engine-side; trivial.
- **The midnight rule**: bottles belong to the calendar day they happen on (`startTime ∈ [0, 1440)`). Overnight bottles count toward their calendar day's `bottlesPerDay` total but do NOT anchor the day's cascade. The drawer's save path must route bottles to the correct day doc based on their calendar day, not the currently-active day.

### §2.4 Total

~4 scheduling rules + 2 derived views + ~4 invariants. **Down from 179 numbered rules.**

---

## §3 Dream feed — render-only label

Today: 10 rules (R8.0-R8.9). **Per Jake 2026-05-13: dream feed has zero engine logic. It is purely a render-time label.**

### §3.1 The mechanic

Settings carries an opt-in flag:

```ts
dreamFeed: {
  enabled: boolean;
  // Optional UX hint for the configured time (e.g., 8:30 PM). Render
  // and Settings may use this; engine does NOT.
  time?: TimeMin;
}
```

At render time, when `dreamFeed.enabled === true`:

> The **first bottle whose `startTime > bedtime.startTime`** gets labeled "Dream Feed" instead of "Bottle N."

That's it. The bottle itself is just a regular bottle — either projected by the bottle cascade (which already continues past bedtime up to `tomorrowWake` per R5.8) or recorded manually by the user. There is no `dream_feed` event type, no separate anchor math, no smart-gap fallback, no engine awareness of dream feed at all.

### §3.2 What's gone vs the previous draft

The earlier proposal had a smart-gap fallback (`max(lastBottle + minGap, bedtime + offset)`) and a separate event type discussion. **Both deleted.** Predict-don't-prescribe: if the cascade lands a bottle after bedtime, label the first one; if it doesn't, no label. The user can record a bottle whenever they actually give one — it gets labeled if it qualifies.

### §3.3 Owners

No engine-side default owner inheritance anywhere. R8.8 ("opposite of bedtime owner") is **dropped**. Owner default for any bottle (dream feed included) comes from settings or template, never engine.

### §3.4 Overnight bottles

Other overnight bottles can happen (baby wakes hungry at 2 AM). Those are just regular bottles cascading past bedtime, no special handling. Only the FIRST post-bedtime bottle gets the dream-feed label; subsequent overnight bottles are labeled normally.

---

## §4 Render / UX concerns — split into a separate doc

Rules currently in REQUIREMENTS.md that are render or interaction concerns, NOT scheduling:

- R3.11 (24px minimum tappable height)
- R3.12 (inline duration display when endTime is set)
- R3.13 (short nap row collapse)
- R5.4 (chronological renumber — actually engine-side; stays in engine)
- R5.13 (confirm if recorded too soon — UX prompt)
- R6.3-R6.6 (putdown visual styling, z-order)
- R7.6.1 (bedtime confirmation prompt — UX nice-to-have, NOT engine)
- R7.12 (sage-tint bedtime fill)
- R8.5-R8.6 (dream feed chip placement, label)
- R16 (entire timeline display section)
- R17 (drawer/form validation)
- R18 (dashboard)
- R19 (settings)

These move to `docs/v3/RENDER_SPEC.md` (or similar) after #132 lands. The numbered rule system in REQUIREMENTS.md becomes engine-only.

---

## §5 Data model + lifecycle — unchanged

- R1.* (schema, identity, kind, times) — keeps current home in `docs/v3/REQUIREMENTS.md` §1 and `src/v3/schemas.ts`.
- R2.* (lifecycle, status transitions) — same.
- R14.* (day lifecycle), R20.* (persistence) — same.
- R22.* (membership) — same.

No changes here. The simplification is about *scheduling rule* count, not the underlying data model.

---

## §6 Heuristics we're keeping (per Jake, 2026-05-12)

| Heuristic | Stays in engine | Why |
|---|---|---|
| Short-nap adjustment (R3.7-3.8) | Yes | Physiology: baby will be more tired if they don't complete a full sleep cycle; needs nap sooner. |
| Bottle interval by amount (R5.2 / `bottleIntervalRules`) | Yes | Smaller bottle → hungrier sooner. Real predictive value. |
| Bottle nudge out of nap (now inline in cascade) | Yes | Baby can't eat during a nap. Hard constraint. |
| Pre-nap top-off | Not yet | Mentioned in Jake's plain-English rules but not currently implemented. Backlog. |
| Post-nap extra hunger | Not yet | Same. Backlog. |
| Bedtime confirmation dialog (R7.6.1) | **No — moves to UX layer** | "Tap Start Nap at 6:50 PM with threshold 7 PM → confirm bedtime?" is dashboard/drawer logic. Engine emits the event; UI wraps a confirm. |

---

## §7 Open questions — resolved 2026-05-13

1. **Dream feed event type**: ✅ **Resolved — `bottle` with no separate type at all.** Dream feed is purely a render-time label on the first bottle that lands after actual bedtime. Settings carries `dreamFeed.enabled` (and optional `time` as a UX hint). No engine logic. See §3.
2. **Backfill collision with the inline nap snap**: ✅ **Resolved — same snap-to-closest-edge rule applies in both directions.** Direction of cascade walk doesn't matter; the per-step "where does the proposed `T` actually land?" logic is identical whether `T = prev + interval` (forward) or `T = next - interval` (backward). Also: **no-feed region is the nap itself only — NOT `[nap.start - putdownLead, nap.end]`.** A bottle can land during wind-down; wind-down is render-only synthetic. See §2 bottle cascade row + DOMAIN.md §4.
3. **Short-nap adjustment direction**: ✅ **Resolved — shorten ONLY the wake window immediately following the short nap; cascade handles the rest naturally.** The current behavior (R3.7-3.8) is correct in shape; preserve it in the new sequential cascade. Definition: a short nap is one where baby wakes BEFORE completing a sleep cycle — NOT "one cycle" (one full cycle IS a complete nap). DOMAIN.md §8.2 corrected to match.
4. **R5.13 confirm-if-too-soon**: ✅ **Resolved — DELETE from engine entirely.** Predict-don't-prescribe. The drawer's existing 15-min "accidental duplicate" guard is the only thing needed at record-time; that's a UX-layer concern. Engine does NOT emit a flag or warning for "too-soon" bottles. Smaller bottles legitimately produce shorter intervals (DOMAIN.md §2); the engine has no business calling that anomalous.

---

## §8 Incremental execution plan

| Step | Scope | Status |
|---|---|---|
| **Scope doc (this doc)** | Blueprint without code | ✅ Merged (PR #132) |
| **DOMAIN.md** | Plain-English model of baby behavior as first-class artifact | In review (PR #133) |
| **Bottle-cascade PR**: sequential bottle cascade | Replace R5.1 + R5.6 + R5.7 + R5.11 with one rule. Delete R5.13 (engine flag). Add backfill rule (§F19b / §F21 from FAST_FOLLOW). | ✅ Merged (PRs #135, #136) |
| **Nap-cascade PR**: sequential nap cascade | Inline R7.5/R7.6/R7.11 (bedtime substitution) + R7.4/R7.4b (drop past-bedtime projections) into R3.1. Delete `bedtime.ts`. | ✅ Merged (PR #138) |
| **Dream-feed PR**: render-only label | Delete `dreamFeed.ts` + `dream_feed` event type. Render-time `applyDreamFeedLabel` relabels first projected post-bedtime bottle. | This PR |
| **Pumps + dailyRecurring collapse PR** (optional) | Reassess whether unifying R9 + R11 is worth abstraction cost after dream-feed lands. Daycare R21.3 (ownership window) stays separate regardless. | After dream-feed |
| **Docs reorg PR**: REQUIREMENTS reorg | Split render/UX into `RENDER_SPEC.md`. Renumber engine-only rules. Archive `REQUIREMENTS.md` as `REQUIREMENTS_v3_legacy.md`. | After scheduled-recurring |
| **Stop** | Engine matches scope; doc matches engine. | — |

Pause points: after each PR. If the bottle-cascade PR doesn't produce the predicted gap-reduction + complexity-reduction, we re-evaluate before the nap cascade.

---

## §9 What this is NOT

- Not a schema rewrite.
- Not a lifecycle redesign.
- Not a render rewrite (split-out only).
- Not a Firestore migration (data model unchanged).
- Not a settings UX rewrite (settings shape stays as-is; `dreamFeed.enabled` already exists).
- Not a big-bang rewrite. **Every step is independently mergeable.**

---

## §10 Decision log

- 2026-05-12 — Jake: "I really, really hate to do another massive engine rewrite" → confirmed incremental path, NOT a v4 rewrite.
- 2026-05-12 — Jake: "Dream feed timing is... maybe just a per-day setting?" → initial direction.
- 2026-05-12 — Jake: "Nothing needs default owners. That's what templates and settings are for" → confirmed R8.8 (engine-side owner default) is dropped, no engine-side owner inheritance anywhere.
- 2026-05-12 — Jake: "Short-nap adjustments = yes, that's just physiology" → kept in engine.
- 2026-05-12 — Jake: bedtime confirmation prompt → UX layer, not engine.
- 2026-05-13 — Jake (Q1 resolution): Dream feed is `bottle` + flag, "simple logic, first bottle after actual bedtime gets labeled 'Dream Feed.' Can even be handled in UX" → simplified §3: engine has NO dream-feed code, label is render-only.
- 2026-05-13 — Jake (Q2 resolution): "A bottle can, however, be the entirety of wind-down... 'Closest edge' should maybe only apply to nap, not nap+wind-down (since wind-down is a pure synthetic)" → bottle cascade no-feed region is `[nap.start, nap.end]` only; putdown is render-only. DOMAIN.md §4 updated.
- 2026-05-13 — Jake (Q3 resolution): "A short nap is a nap where the baby wakes before a complete sleep cycle. One full sleep cycle is a successful/complete nap. That said, only the wake window following the short nap should be adjusted, and all following nap times are thusly recalculated." → DOMAIN.md §8.2 corrected; current adjustment direction is right.
- 2026-05-13 — Jake (Q4 resolution): "No - don't do this at all. Retain the UX-side 15-min 'accidental duplicate' guard. PREDICT not PRESCRIBE" → R5.13 fully dropped from engine; no UX-layer reimplementation needed beyond the existing 15-min duplicate guard.
- 2026-05-13 — Jake ("midnight rule"): "bottles for a given day are the bottles that fall between 12:00 AM and 11:59 PM of that day." Overnight bottles attach to the calendar day they fall in, but do NOT anchor the cascade — cascade still anchors at wake+buffer regardless. Engine: bottle cascade stops at midnight (1440), not tomorrowWake. Persistence: drawer save-path routes by calendar day, not active-day-id. Migration: wipe + start fresh, dev-only (no production data yet). DOMAIN.md §2 updated.
