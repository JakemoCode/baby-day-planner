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
>
> **Sequencing constraint (PROVEN — see §8):** the flicker fix (`81e2554`) must
> NOT ship in isolation. A diagnostic harness shows that, on its own, it makes the
> full-day chain **re-phase off every recorded/added feed** (logging a bottle
> reshuffles the day) and leaves the time-edit duplicate (C) live. It is
> necessary-but-not-sufficient: bundle it with PR A (and ideally PR B).

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
| **A** | Fix recording/adding a feed (see §8-B + the model decision below). + seam test. | Low–med; engine-local. Unblocks the FAB bug. **Encodes a model decision — confirm first.** |
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
- **PR A model decision (below).**

## §8 Diagnostic findings (verified 2026-06-02, `/diagnose`)

A throwaway harness drove the real `projectDay` + a simulation of the
persist-on-view (auto-promote) cycle on Jake's "Lil Timmy" day (1:00 AM wake).
Sharp pass/fail per scenario:

| Scenario | Result | Root cause |
|---|---|---|
| **A — flicker** (write-cycle idempotency) | ✅ **fixed** by `81e2554` | cold-start count cap vs anchored time cap; now both fill to cap → identical set across navs. Survives the collapse (still correct for the cold-start case). |
| **B — FAB-add @6:25** | ❌ **deletes the 4:10 feed** | `anchorAbsorbs` (window = one full interval): cursor at 4:10 sees the 6:25 anchor 135 min ahead (<180) and suppresses the 4:10 slot; the chain then re-phases from 6:25 → `1:10, 6:25, 9:25, …`. The morning forecast "moves." |
| **C — time-edit duplicate** | ❌ **divergent id** | edited bottle doc id `recorded_bottle_t190` (frozen at the 3:10 original) vs a fresh cold-start projection at the edited 4:10 → `recorded_bottle_t250`. A loading-race persists a 2nd doc. The startTime-id has a correctness hole under edits. |
| **D — zombie** (two clients) | ✅ **fixed** by #301 | divergent `eventKey` (`bottle_1` vs `bottle_2`) → same `recorded_bottle_t70`. Converges. |

**Implications:**
- **Sequencing (Jake's constraint, now proven):** `81e2554` alone converts "numbers
  flicker" into "logging a feed reshuffles the day" (B) and leaves the dup (C). Ship
  it bundled with A, not in isolation.
- **§4 supersede:** C is a correctness hole in #301's startTime-id that only the
  collapse closes (no persist-on-view → uuid → nothing to re-derive). Strengthens
  "supersede #301."

### PR A model decision — what does logging/adding a feed mean?
B is **not a clean bug** — it encodes a domain choice. After a real feed at 6:25
with a prior real feed at 1:10, the 4:10 was only a *forecast*. Per DOMAIN §2 a
long early-morning stretch (1:10→6:25) is normal, so dropping the 4:10 forecast and
re-flowing from 6:25 is arguably **correct**. But the absorption window is a blunt
instrument that would also delete a legitimate *daytime* forecast, and it reads as
"my added bottle moved an existing one."

Decision needed: when a feed is logged/added, the forward forecast should re-flow
from it (DOMAIN: interval flexes with intake) — but should an **earlier** forecast
slot be (a) **dropped** (treat the logged feed as the realized rhythm), or (b)
**kept** (treat the logged feed as an *extra*, e.g. a top-off, and flag the earlier
slot as an unlogged feed)? PR A implements whichever Jake picks; absorption is
narrowed to fire only at/after the cursor reaches the anchor, never suppressing a
full-interval-earlier slot.
