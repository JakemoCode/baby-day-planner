# Bottle cascade & identity — spec

The single authoritative doc for the bottle subsystem. Supersedes the earlier
`F66_SCOPE.md`, `F66_PLAN.md`, `F66_PR4_PLAN.md`, and the
`f66-cascade-and-state-model-audit` grill doc (all archived under
`docs/_archive/v3/`). Update this doc, not the code, if implementation reveals drift.

Born when the step-back rule fired on a three-bug chain (2026-06-01 → 06-02):

1. **Zombie duplicates** — concurrent auto-promote persisted the same feed under
   divergent `recorded_<eventKey>` ids (fixed by PR #301 / ADR-0007, deterministic
   `recorded_bottle_t<startTime>`).
2. **Nav flicker** — cold-start capped at `bottlesPerDay`, the anchored chain filled
   to the time cap; persisting-on-view flipped the day cold-start→anchored mid-view
   (fixed: cold-start now fills to the cap too, commit `81e2554`).
3. **FAB-add relocates a feed** — logging a bottle at 6:25 made it *absorb* the 4:10
   forecast (the absorption window was one full interval wide). **Fixed in #303** by
   removing absorption entirely: recorded bottles re-cascade forward, never absorb a
   forecast slot.

All three traced to **two mechanisms doing too much** (§2). The collapse is in §3;
how it shipped is §5.

> **Status — SHIPPED (2026-06-02, PR #303).** The whole collapse landed as a single
> PR (not the planned PR-K → PR-B → PR-D split — see §5): no-absorption cascade,
> ephemeral projections (`useAutoPromotePersistence` deleted), day-close forecast
> freeze, chronological owners. #300/#301 were closed superseded; their keepers were
> extracted onto #303. This doc is now the historical record of *why* the subsystem
> looks the way it does.
>
> **Sequencing constraint (PROVEN — see §8), why it forced one PR:** the flicker fix
> (`81e2554`) could NOT ship in isolation — on its own it makes the full-day chain
> **re-phase off every recorded/added feed** (logging a bottle reshuffles the day)
> and leaves the time-edit duplicate (C) live. The fixes were coupled (can't remove
> the persist-on-view hook without the full-day cascade; can't ship the cascade
> without removing the hook), so the split plan collapsed into #303.

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
   for bottles (recorded bottles were targeted to use a uuid like pumps/extras;
   see §4 — but #303 kept `recorded_bottle_t<startTime>`, see §5/§7).
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

**DECIDED (2026-06-02): supersede #301.** The zombie is killed by §3.1 (no
persist-on-view → recorded bottles are uuids), not by the startTime-id — which
scenario C proves is fragile under time-edits. **But #301 is a mix; don't close it
blind:**

| #301 contains | Disposition |
|---|---|
| Flicker fix `81e2554` (cold-start fills to cap) | **KEEP** — survives the collapse |
| R12.6 owner-by-index → chronological position | **KEEP** — correct, coupled to the full-day cascade |
| R12.10 / `setOwnerOverride` → `bottle_pos_N` positional | **KEEP** — projected-bottle overrides still apply |
| `recorded_bottle_t<startTime>` id, `recordedIdForEvent`, `isRecordedBottleId`, drawer/persist id wiring | **DROP** — superseded by uuid + no-persist-on-view |

So "supersede #301" = **extract the keepers onto the rebuild, drop the doc-id
machinery, close the PR.** Per "no silent behavior drops," the keepers must land,
not vanish with the PR.

**Logged-feed semantics — DECIDED (2026-06-02): a FAB-add is an intentional
*extra*.** The user could have time-edited a forecast bottle (less work) but chose
to FAB-add (more work) — trust that signal. So **the action disambiguates intent:**
drawer time-edit on a projection = *realize/relocate* that forecast slot; FAB-add =
a distinct extra feed that **inserts and never deletes a forecast** (PR A).

> **Implemented (2026-06-02).** The §F66 rebuild (`#303`) shipped the FAB-add =
> extra half (no-absorption) but not the realize/relocate half — editing a forecast
> bottle to a *later* time spawned a duplicate. Closed by tagging the recorded doc
> `realizedForecast: true` at the write path (`useDrawer`) when a projection is
> edited; the cascade absorbs the one imminent slot that tag realized. FAB-add stays
> untagged. See `Event.realizedForecast`, `bottles.ts` (R5 realize branch).
> Known gap (no sane edit path reaches it): a forecast moved >1 interval strands its
> old slot — identity-based absorption tracked in §F73.

---

## §5 How it shipped — one PR (#303)

The rebuild was *planned* as a three-step split (PR-K keepers+extras → PR-B
no-persist-on-view → PR-D retire `bottlesPerDay`) re-based on the open #300/#301
stack. In practice the steps were **too coupled to separate**: you can't remove the
persist-on-view hook without the full-day cascade already in place, and you can't
ship the full-day cascade without removing the hook (it would persist the wider
forecast and re-feed the engine). So #300/#301 were **closed superseded** and the
whole collapse landed as **one PR, #303**, built via TDD on `feat/f66-prb-ephemeral-projections`.

What #303 delivered, against the planned steps:

| Planned step | Disposition in #303 |
|---|---|
| PR-K — keepers (flicker `81e2554`, R12.6 chronological owners, R12.10 positional overrides) + FAB-add fix | **Landed.** Keepers extracted; absorption *removed entirely* (stronger than the planned "narrow the window" — see §4 / the no-absorption decision). |
| PR-B — no persist-on-view; ephemeral projections; day-close snapshot; recorded bottles → uuid | **Landed**, with one deviation: recorded *bottles* kept the deterministic `recorded_bottle_t<startTime>` id (`recordedIdForEvent`/`isRecordedBottleId` retained) rather than moving to uuid. The zombie/flicker root was killed by deleting `useAutoPromotePersistence` (projections never persist on view); the day-close `forecastSnapshotDocs` freeze is the single moment history is written. The uuid migration was judged unnecessary once persist-on-view was gone. |
| PR-D — retire `bottlesPerDay` | **Deferred.** Engine already ignores it (`81e2554`); schema/UI field removal is still pending as a mechanical fast-follow. |

---

## §6 What stays untouched
- Day/Event schema, lifecycle states (projected/recorded/completed), Firestore
  persistence layer. The overgrowth is in the **rules + the persist-on-view hook**,
  not the data model (same finding as the prior bottle simplification).
- Nap/bedtime identity (`recorded_<eventKey>`) — their keys don't renumber.
- Midnight rule, no-eating-during-naps, interval-from-amount, dream-feed.

## §7 Open questions — resolved in #303
- ~~§4: supersede vs. build-on #301.~~ **Superseded #301** (keepers extracted), but
  recorded bottles kept `recorded_bottle_t<startTime>` rather than moving to uuid —
  the no-persist-on-view change alone closed the zombie/dup, so the migration wasn't
  needed.
- ~~Day-close snapshot: which device writes it / what triggers archival.~~ Written by
  the single client that confirms morning wake (`handleConfirmWake` → `startNewDay`
  with `freezeForecast: forecastSnapshotDocs(...)`); the archival transaction freezes
  the closing day's forecast bottles into its history. Single-writer, no concurrency.
- ~~Does any *projected* bottle need to survive a reload mid-day?~~ No — pure
  recompute every render; the cascade is idempotent. Projections never persist
  except the one day-close freeze.
- ~~PR A model decision (below).~~ Resolved: a FAB-add is an intentional **extra**
  that inserts and never deletes/relocates a forecast; recorded bottles re-cascade
  the forward forecast but never absorb an earlier slot.

Still pending (fast-follow): retire the `bottlesPerDay` field from schema/UI/defaults
(engine already ignores it).

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
