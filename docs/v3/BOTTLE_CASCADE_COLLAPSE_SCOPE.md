# Bottle cascade & identity collapse

Blueprint for collapsing the bottle subsystem after the step-back rule fired on
a three-bug chain (2026-06-01 → 06-02):

1. **Zombie duplicates** — concurrent auto-promote persisted the same feed under
   divergent `recorded_<eventKey>` ids (fixed by PR #301 / ADR-0007, deterministic
   `recorded_bottle_t<startTime>`).
2. **Nav flicker** — cold-start capped at `bottlesPerDay`, the anchored chain filled
   to the time cap; persisting-on-view flipped the day cold-start→anchored mid-view
   (fixed: cold-start now fills to the cap too, commit `81e2554`).
3. **FAB-add relocates a feed** — logging a bottle at 6:25 made it *absorb* the 4:10
   forecast (the absorption window is one full interval wide). **Open.**

All three trace to **two mechanisms doing too much**. This doc maps the collapse.
It is the spec — update the doc, not the code, if implementation reveals drift.

> **Status — scope, pre-implementation.** Confirm §4 (the PR2-supersession
> decision) before opening any implementation PR. The collapse may moot part of
> PR #301; sequence accordingly.

---

## §1 The model (DOMAIN.md §2, in Jake's words)

Babies eat at **roughly regular intervals**. A **smaller feed → hungry sooner**
(interval-until-next flexes with actual intake, not a fixed grid). There are
**opportunistic extra feeds** — pre-nap top-offs, post-nap extra hunger, overnight
bottles. **Babies don't skip feeds.** **Bottles can't fall inside a nap.** A
bottle's **number is its chronological position** — pure emission of order.

Two consequences the implementation must honor:
- "I added a bottle" can mean **an extra feed** (top-off), *not* "the forecast
  actually happened here." Adding/logging a feed must never delete another feed.
- The day's feeds = **recorded facts** + a **forecast that fills the rest**. The
  forecast is a guess; reality wins and the forecast re-flows around it.

---

## §2 Current mechanisms & where they overflow the model

| Mechanism | Bug | Overflow |
|---|---|---|
| **Persist projections on view** (`useAutoPromotePersistence` writes now-crossed forecasts to Firestore) | zombie, flicker | A *forecast* (derived, should be ephemeral) becomes *stored state* that re-feeds the engine. Only exists because archived days read static docs — i.e. persistence is needed **at day-close**, not on every view. |
| **Absorption window** (`anchorAbsorbs`: a recorded feed within one *full interval* claims a projected slot) | FAB-add "moved" 4:10→6:25 | Conflates "the forecast came true" with "an extra feed happened." A feed 135 min from a slot eats it → a skipped feed, which the model forbids. |
| **Slot eventKey machinery** (`maxRecorded`, `nextFreeSlot`, projected eventKeys = `bottle_{maxRecorded+1}`, frozen recorded keys) | (latent; fed renumber churn) | Post-PR #301 **nothing reads the bottle eventKey number** (owner-by-index → label position, overrides → `bottle_pos_N`, doc id → startTime). It only feeds itself. |
| **`bottlesPerDay`** | flicker (cold-start cap) | Already retired from the engine (commit `81e2554`); a count-clamp that violates predicts-not-prescribes. Field removal pending. |
| **Deterministic `recorded_bottle_t<startTime>` id** (PR #301) | — | Solves multi-client auto-promote convergence. **Only needed because projections are auto-persisted concurrently.** Remove that, and the reason for it goes too (see §4). |

---

## §3 Target collapsed shape

1. **Projections are ephemeral during the active day.** Pure recompute from the
   recorded facts every render; **never persisted**. No write-on-view ⇒ no zombie,
   no flicker, *by construction*. The "zero-edit forecast sticks in history"
   feature is preserved by **snapshotting the forecast into recorded docs once, at
   day-close/archival** — the only moment history must freeze.
2. **Absorption realizes only the imminent next slot.** A recorded/added feed
   re-flows the forecast **forward** from itself (consumption-adjusted interval) and
   never deletes an earlier or extra feed. An added bottle **inserts**; it is a fact.
3. **Bottle number = chronological position. Pure.** Retire `maxRecorded` /
   `nextFreeSlot` / projected-slot reservation. eventKey stops carrying a number
   for bottles (recorded bottles use a uuid like pumps/extras; see §4).
4. **Retire `bottlesPerDay`** from schema/UI/defaults (engine already ignores it).

---

## §4 The decision that gates everything: does this supersede PR #301?

PR #301's `recorded_bottle_t<startTime>` id exists **solely** to make two devices
auto-promoting the same forecast converge to one doc. If §3.1 lands (projections
never auto-persist; recorded bottles are created only by **explicit single-user
actions** — log-feed, FAB-add — plus a **single-writer** day-close snapshot), then:

- Recorded bottles can use a **uuid** (`<type>_<uuid>`), exactly like pumps/extras.
  One tap = one id; no concurrency; no zombie.
- The deterministic-startTime id, `recordedIdForEvent`, `isRecordedBottleId`, and
  the time-edit id-integrity problem (#301 reviewer finding, still open) **all
  dissolve** — there's nothing to converge and nothing to re-derive.

**Decision needed:** does PR #301 merge as-is (and the collapse builds on it), or
does the collapse **supersede** it (close #301, fold the zombie fix into "don't
persist projections on view")? Recommendation: **supersede** — #301 is a narrower
fix for a problem §3.1 removes at the root. But #301 is already reviewed and green,
so merging it first as a safety net (then simplifying) is also defensible.

---

## §5 Incremental PR plan (each independently mergeable; confirm §4 first)

| PR | Scope | Risk |
|---|---|---|
| **A** | Narrow `anchorAbsorbs` to the imminent slot only; added/logged feed inserts, never eats a neighbor. + seam test (FAB-add at 6:25 keeps the 4:10 feed). | Low; engine-local. Unblocks the FAB bug. |
| **B** | Stop persisting projections on view (`useAutoPromotePersistence` → ephemeral recompute). Move the snapshot-to-recorded to day-close/archival. | Medium; touches lifecycle + history. The crux of §3.1. |
| **C** | Recorded bottles → uuid; retire `recordedIdForEvent`/`recorded_bottle_t`/slot machinery (`maxRecorded`/`nextFreeSlot`). Resolves §4. | Medium; identity + migration. |
| **D** | Retire `bottlesPerDay` field (schema/UI/defaults/fixtures). | Low; mechanical. |

PRs are ordered so each is shippable alone. A is the only one that touches the
open FAB bug; if dev-testing needs unblocking sooner, A can go first standalone.

---

## §6 What stays untouched
- Day/Event schema, lifecycle states (projected/recorded/completed), Firestore
  persistence layer. The overgrowth is in the **rules + the persist-on-view hook**,
  not the data model (same finding as the prior bottle simplification).
- Nap/bedtime identity (`recorded_<eventKey>`) — their keys don't renumber.
- Midnight rule, no-eating-during-naps, interval-from-amount, dream-feed.

## §7 Open questions
- §4: supersede vs. build-on #301.
- Day-close snapshot: which device writes it, and what triggers archival exactly
  (first wake of the next day? explicit "Start new day"?).
- Does any *projected* bottle ever need to survive a reload mid-day for UX reasons,
  or is pure recompute always acceptable now that the cascade is idempotent?
