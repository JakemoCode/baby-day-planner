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
| **Bottle cascade** | R5.1, R5.6, R5.7, R5.11 | Sequential, anchored at `wake + buffer` (no prior bottles) OR earliest non-projected bottle. Each step `= prev.startTime + intervalForAmount(prev.amountOz)`. If the proposed time lands inside `[nap.start - putdownLead, nap.end]`, snap to nearest edge with the "nowMinutes" fallback. Stops at `tomorrowWake` (R5.8). |
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

### §2.4 Total

~4 scheduling rules + 2 derived views + ~4 invariants. **Down from 179 numbered rules.**

---

## §3 Dream feed — collapsed spec

Today: 10 rules (R8.0-R8.9). The proposal collapses dream feed into the **scheduled recurring events** rule family with one extra heuristic.

### §3.1 The simple case (stable baby)

Once baby's schedule is stable, dream feed is just a daily recurring event at a fixed time (e.g. 8:30 PM or 9 PM). Configured per-family in settings:

```ts
dreamFeed: {
  enabled: boolean;           // opt-in
  time: TimeMin;              // e.g. 8:30 PM = 1230
  ownerSlot?: OwnerSlot;      // optional default owner; templates/settings own this
}
```

If `enabled === true`, the scheduled-recurring rule emits a `bottle`-kind event (or its own `dream_feed` type if we want the render to differ) at the configured `time` each day.

### §3.2 The smart-gap fallback (early days)

If `dreamFeed.useSmartGap === true` (or `time === null`), the dream feed time is computed instead of fixed:

```
startTime = max(
  lastBottle.startTime + minGapAfterLastBottle,
  bedtime.startTime + offsetAfterBedtime
)
```

With defaults `minGapAfterLastBottle = 120` and `offsetAfterBedtime = 90` (configurable). This is the only case where dream feed depends on the bottle cascade output — and even then, it's a single read of `lastBottle`, not membership in the cascade.

### §3.3 Owners

Per Jake (2026-05-12): no engine-side default owner inheritance. R8.8 ("opposite of bedtime owner") is **dropped entirely**. Owner default for dream feed comes from settings or template — same as any other event.

### §3.4 Overnight bottles

Dream feed is opt-in and one-per-day. Other overnight bottles can still happen (baby wakes hungry at 2 AM). Those are handled by:

- The bottle cascade continues past bedtime up to `tomorrowWake` (current R5.8 behavior — preserved).
- Recorded overnight feeds are just bottles with `startTime > bedtime.startTime`. Nothing special.

Dream feed is distinct because it's *scheduled* (proactive), not *predicted* (cascade-driven). That's the only reason it has its own rule path.

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

## §7 Open questions (resolve during #132)

1. **Dream feed event type**: stays as `dream_feed`, or becomes `bottle` with a flag? Pro of separate type: render can differ. Pro of `bottle`: simpler. Decide when implementing.
2. **Backfill collision with R5.6 (now inline)**: when backfill walks backward and a slot lands in a nap region, does the snap go to the EARLIER edge (away from anchor) or LATER edge (toward anchor)? Test both, pick the one that produces saner visual cadence.
3. **Short-nap adjustment direction**: currently shortens the FOLLOWING wake window. With sequential cascade, this still works the same — verify in #132's sibling work.
4. **R5.13 (confirm if too soon)**: keep in engine as a warning flag on the event, or move to drawer UX? Leans UX, but the engine knows the interval — it could emit a flag.

---

## §8 Incremental execution plan

| Step | Scope | Status |
|---|---|---|
| **Scope doc (this doc)** | Blueprint without code | In review |
| **the bottle-cascade PR**: sequential bottle cascade | Replace R5.1 + R5.6 + R5.7 + R5.11 with one rule. Add backfill rule (§F19b / §F21 from FAST_FOLLOW). | Next |
| **Bottle-cascade PR**: sequential bottle cascade | Replace R5.1 + R5.6 + R5.7 + R5.11 with one rule. Add backfill rule (§F19b / §F21 from FAST_FOLLOW). | Next |
| **Nap-cascade PR**: sequential nap cascade | Same shape applied to R3.* | After bottle cascade lands and proves the pattern |
| **Scheduled-recurring PR**: collapse | Unify R8 (dream feed) + R9 (pumps) + R11 (daily recurring) + R21 (daycare) into one rule with weekday/offset/fixed-time variants | After nap cascade |
| **Docs reorg PR**: REQUIREMENTS reorg | Split render/UX into `RENDER_SPEC.md`. Renumber engine-only rules. Archive `REQUIREMENTS.md` as `REQUIREMENTS_v3_legacy.md`. | After scheduled-recurring |
| **Stop** | Engine matches scope; doc matches engine. | — |

Pause points: after each PR. If #132 doesn't produce the predicted gap-reduction + complexity-reduction, we re-evaluate before #133.

---

## §9 What this is NOT

- Not a schema rewrite.
- Not a lifecycle redesign.
- Not a render rewrite (split-out only).
- Not a Firestore migration (data model unchanged).
- Not a settings UX rewrite (settings shape may grow one field for `dreamFeed.useSmartGap`).
- Not a big-bang rewrite. **Every step is independently mergeable.**

---

## §10 Decision log

- 2026-05-12 — Jake: "I really, really hate to do another massive engine rewrite" → confirmed incremental path, NOT a v4 rewrite.
- 2026-05-12 — Jake: "Dream feed timing is... maybe just a per-day setting?" → confirmed dream feed as scheduled recurring event with optional smart-gap fallback.
- 2026-05-12 — Jake: "Nothing needs default owners. That's what templates and settings are for" → confirmed R8.8 (engine-side owner default) is dropped, no engine-side owner inheritance anywhere.
- 2026-05-12 — Jake: "Short-nap adjustments = yes, that's just physiology" → kept in engine.
- 2026-05-12 — Jake: bedtime confirmation prompt → UX layer, not engine.
