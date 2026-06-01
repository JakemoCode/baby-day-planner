# §F66 — Cascade + recorded/projected state model audit (consolidating grill)

**Source**: Jake, 2026-05-25 (weekend dogfood).

**Status**: `pending` — multi-step. **(1) grill-with-docs** to settle the model, **(2) plan** to sequence the collapse, **(3) implementation PRs**. No cascade-touching code lands until step 1 closes.

**Step-back trigger**: per `.claude/rules/step-back.md`, four+ signals are firing — patch-on-patch trajectory in bottle/nap cascades, an inferred-from-shape state primitive that's leaking in many directions, the same rule-layer trigger zone as the 2026-05-12 collapse, and Jake's own framing ("a more holistic solve"). Do not ship the items below as one-off PRs.

---

## Dogfood issues (2026-05-23 → 2026-05-25)

| # | Symptom | Existing entry | Disposition |
|---|---|---|---|
| 1 | Dream feed not auto-populating; wants `defaultTime` | §F58 (grill) | absorb into §F66 grill |
| 2a | Dashboard "end overnight sleep" CTA persists after Now crosses nap 1 start | §F48-adjacent (dashboard reads projected list) | absorb |
| 2b | After 2a, tapping "Start Nap" inserts nap 2 on top of recorded nap 1 | §F59 (id conventions / orphan writes) | absorb if widened |
| 3 | Split bedtime into `bedtimeThreshold` + `earliestBedtime`; today nap-tail crossing threshold produces 4:45pm bedtime | §F64 | absorb; same Jake heuristic |
| 4 | Engine inserts a nap with only ~5min wake-window before bedtime; if there's no room for a proper wake window, drop the nap | §F64-sibling | new; absorb |
| 5 | Dashboard "134m ago" → "2h14m ago" formatting | none | **ship separately** (UX, trivial) |
| 6a | Default-amount bottle at projected time stays `projected` → re-grabbed by next "Start Bottle" | spiritually §F62 | absorb |
| 6b | Owner change shouldn't promote to `recorded`; amount change should + remove from chain | none | absorb |
| 6c | Edited start/end of past or current nap should become `recorded` | none | absorb |
| 6d | Total bottle volume calculation wrong (likely downstream of 6a) | none | symptom of 6a |
| 6e | Past bottle: edit time + amount + save → bottle later disappears | none | **write-path bug**; needs Contaminated Data section in its fix PR; absorb |
| 6f | Bottle should respect Putdown *start*, not the synthetic putdown emit point — bottle becomes putdown | §F54-adjacent | absorb |
| 6g | Cannot get a 7th bottle to render with `bottlesPerDay=7` even with room before bedtime + manual add attempts | none | absorb (cascade ceiling/cap bug) |
| 7 | "Nap N can't overlap putdown" validation toast flashes on save (save still succeeds) | none | **ship separately** (UI, trivial) |
| 8 | Edit two PAST bottles (time + amount + owner=Daycare); after Dashboard→Timeline, NO-OWNER **zombie** bottles reappear at the original forecast times alongside the edited ones. They show "Reset"; resetting deletes them but they return after another Dashboard→Timeline. (2026-06-01, screenshot) | sharper restatement of #6a/#6b/#6e + §F59 | absorb; **write-path** — Contaminated Data section required in fix PR |

Already-open entries that fold into this audit: **§F48, §F54, §F58, §F59, §F62, §F64**. Their individual specs stay as-is until the grill settles the model; if the model collapses change their fix shape, update them then.

---

## 2026-06-01 — zombie-bottle investigation (issue #8)

Diagnosed with `/diagnose`. **Confirmed root-cause family** (not yet a deterministic repro of the exact screenshot):

- **eventKey instability is real and proven.** A projected bottle's `eventKey` is `bottle_<slot>` where `slot = maxRecorded + 1` (`computeRenumber`, `bottles.ts`). As forecast bottles auto-promote and persist through the day, `maxRecorded` climbs, so the *same physical forecast slot* gets a *different* `eventKey` on later passes. A failing test demonstrates it: the 10:10 forecast bottle is `recorded_bottle_2` with no recorded bottles, `recorded_bottle_3` once one unrelated recorded bottle exists.
- **`useAutoPromotePersistence` writes under `recordedIdFor(eventKey)`** — a shifting eventKey ⇒ a *new* Firestore doc ⇒ the prior one is **orphaned** (no-owner zombie). The `proj_` id is correctly startTime-anchored (`bottles.ts:33-34`); the eventKey is **not**.
- **`reconcileDuplicateEventDocs` can't catch them** — it groups by `(type, eventKey)`; orphan + edited bottle have *different* eventKeys.
- **Auto-promote runs only on the Dashboard**, not Timeline — editing on Timeline then visiting Dashboard is a distinct ordering.

**But**: a faithful multi-pass harness (project → auto-promote-persist → edit → re-project → re-persist) **converges cleanly** in the simple orderings (edit-in-place and edit-projected-then-persist both end with no zombie). So the reappearing-zombie cycle needs **day-specific conditions not yet captured** — candidates: the daycare dropoff + owner assignment, the amount change altering `intervalForAmount` (so a different slot is forecast), naps shifting snap targets, or a specific navigation/timing ordering. **A captured artifact — the real Jun 1 event docs (id, eventKey, startTime, lifecycle, owner, amountOz) — is needed to replay it deterministically** before any fix.

**Why no interim cascade patch shipped**: per this doc's own gate ("no cascade-touching code until the grill closes") + step-back rule. Simple-case convergence means there's no safe one-liner; a blind patch risks shifting the orphan or suppressing legitimate bottles in real data. Safe interim relief is **data-only** (direct deletion of the no-owner zombie docs) — does not touch the engine.

**Grill must settle**: should a recorded bottle "claim" the forecast slot it was edited from, so the cascade never re-forecasts it? This is the H1 "time < Now ⇒ recorded" primitive plus "a recorded bottle satisfies the nearest forecast slot." Ties directly to #6a/#6b/#6e.

### RESOLVED (2026-06-01 grill) — H4: identity & persistence model

Settled with Jake. The model is **reality wins**: future = projected, past =
recorded; the engine emits no projected-lifecycle event in the past (auto-promote,
ADR-0006); an after-the-fact adjustment re-cascades **future only** (no retroactive
shift, ADR-0006 Concern B); projections are **never persisted** (R2.2).

**Identity decision → [ADR-0007](../../../adr/0007-uuid-storage-identity-eventkey-slot-role.md):**
durable identity is the uuid `id`; `eventKey` is a renumberable slot/role label
that never keys a Firestore doc. `recordedIdFor(eventKey)` is retired.

**Resulting fix shape (for the plan):**
1. Bottle cascade emits the **full day** (like naps R3.1), not forward-from-latest
   (R5.1) — so past reality never vanishes and needs no persistence patch.
2. **Delete `useAutoPromotePersistence`** — only user-recorded/adjusted facts persist.
3. Recorded/adjusted bottles persist under a **stable uuid id** (same path as a
   FAB-added extra); `recorded_<eventKey>` removed.
4. Owner-overrides / owner-only-edit must hang off the durable identity, not a
   still-renumbering projected `eventKey`.
5. **Migration**: existing `recorded_bottle_<N>` docs → uuid ids (Contaminated Data).

Collapses #6a/#6b/#6e/#8 and the §F59 id-convention work.

**Skip semantics — RESOLVED (2026-06-01)**: deleting a past forecast persists a
**suppression** (negative fact), generalizing `Day.suppressedDreamFeed` /
`suppressRecurring`. The cascade permanently omits that feed; future bottles are
unaffected (they cadence from the latest *recorded* bottle). Renders as gone.
Implementation detail for the scope doc: the suppression key must be stable
(durable identity / deterministic past-slot), never a renumbering `eventKey`.

### Bottle thread: model CONVERGED → ready for the plan

The reality-wins + identity + skip model is settled for the bottle/persistence
thread (issues #6a/#6b/#6e/#8, §F59). Sequenced fix (each independently
mergeable, tests-green; cascade PRs carry a `## Contaminated data` section):

1. **Full-day bottle cascade** — R5.1 forward-from-latest → full-day emission
   (match naps R3.1). Past reality never vanishes; no persistence patch needed.
2. **Delete `useAutoPromotePersistence`** + persist recorded/adjusted bottles
   under a stable uuid id (ADR-0007); retire `recorded_<eventKey>`. **Migration**:
   existing `recorded_bottle_<N>` docs → uuid.
3. **Skip = suppression** for regular bottles (generalize dream-feed/recurring).
4. **Owner-overrides / owner-only-edit** off durable identity, not projected eventKey.

**Not yet grilled** (separable threads, own sessions): H2 bedtime band (ADR-0002
exists), H3 cascade cap / #6g 7th-bottle, plus naps-side issues #2a/#2b/#3/#4.

### Update (2026-06-01, +2h) — the missing variable: CONCURRENT clients

Jake: his **wife's Chrome instance was open and editing at the same time**, the bottles "got even weirder," then "ironed out" once both settled. This is the condition the single-client harness lacked, and it sharpens the root cause:

- Two clients each run `useAutoPromotePersistence` **independently**. Each computes the projection from its own (sync-lagged) snapshot of Firestore, so client A and client B can momentarily see **different `maxRecorded`** → assign the **same physical forecast slot different `eventKey`s** → persist it under **different `recorded_bottle_N` doc ids**.
- The persistence transaction only bails on the **same** doc id (`snap.exists()`). Two divergent ids both succeed → **orphans multiply** (matches "even weirder"). When both clients re-converge on the same Firestore state, eventKeys stabilize and no new orphans form ("ironed out").
- So the bug is a **multi-client race amplified by eventKey instability** — the persistence identity depends on a renumbering counter (`maxRecorded`) that two clients can legitimately see differently mid-sync.

**This makes the fix direction concrete and contained**: the recorded-bottle **doc id must be client-independent and renumber-independent** — derive it from the startTime anchor (like the `proj_bottle_t<startTime>` id already does), NOT from `recordedIdFor(eventKey)`. Then two clients forecasting the 10:10 slot both compute `recorded_bottle_t610`, the transaction bail dedupes across clients, and no orphan can form. This is a **persistence-identity** change (`useAutoPromotePersistence` + the drawer's projected-bottle save + reset-detection in `drawerDeletePolicy`), **not** a cascade-rule change — so it can be scoped as interim mitigation without tripping this doc's "no cascade code" gate. It still needs: the real Jun-1 docs to verify, a Contaminated Data plan for existing orphans, and §F59 alignment (id conventions).

---

## Collapse hypotheses to grill

### H1 — "Time < Now ⇒ Recorded" as the primitive

Today `recorded` vs `projected` is inferred from event shape + edit-path heuristics. Jake's proposal in #6c: anything with a time strictly in the past is recorded, full stop.

**Collapses**: #2b, #6a, #6c, #6f, large parts of §F59.

**Trade-off (📌 pinned for grill)**: loses the ability to "skip" a future projection by deleting it — because once the cursor crosses the projection it auto-promotes to recorded regardless of intent.

**Proposed mitigation**: introduce explicit `skipped` lifecycle distinct from `recorded`. Jake flagged this as confusing-but-worth-grilling — the mitigation reads sensible but the UX surface area for "skip" needs design attention before committing. Grill must converge on: how does a user signal "skip"? Is delete = skip, or does delete = "this never happened, recompute as if cap reduced"? What does a skipped event render as on the timeline?

**Open questions for grill**:
- Does "time < Now" apply to start-time, end-time, or both? (Bottle is instant; nap has both.)
- What happens to a `projected` event whose time is edited *forward* into the future? Stays projected? Becomes `overridden`?
- How does owner-only change (which Jake wants to NOT promote) interact with this primitive? Is the owner edit a no-op on lifecycle, or a separate `annotated` state?
- Does an in-progress nap (start < Now < end) count as recorded yet?

### H2 — Bedtime is a band, not a moment

Today bedtime is one threshold; the engine carries the case-(b) substitution rule (nap end crosses threshold ⇒ nap is bedtime) as a guard.

**Jake's proposal**: split into `bedtimeThreshold` (the earliest the *engine* may flip a nap to bedtime) and `earliestBedtime` (the floor for actual bedtime start when a nap is dropped).

**Collapses**: §F64 case (b), issue #4 (no-room-for-wake-window nap), the 4:45pm visual bug, possibly the "delete last nap → early bedtime" UX gap Jake described.

**Open questions for grill**:
- Two settings or one? Could `earliestBedtime` alone replace `bedtimeThreshold` (engine never produces bedtime earlier than `earliestBedtime`, period)?
- What's the rule for "no room for a proper wake window"? Define "proper" — minimum minutes, or derived from current wake-window length?
- Does dropping the last nap reshape downstream cascade (bottle anchor moves), or is it a render-only collapse?

### H3 (latent) — Cascade cap is off-by-one for high `bottlesPerDay`

Issue #6g (7th bottle never renders) is probably its own root cause — likely a cap or termination predicate, not a model issue. May not need the grill; tag for a focused triage during step 2 planning.

---

## Proposed multi-step process

1. **Grill (this doc + `grill-with-docs` skill)** — Jake + Claude work H1 / H2 open questions until each is resolved with a one-paragraph answer. Update `DOMAIN.md` inline as Jake's mental model clarifies; update `ENGINE_SPEC.md` and `DATA_MODEL.md` as decisions land. Outcome: a sharpened model statement, not yet code.
2. **Plan** — convert the resolved model into a sequenced, incrementally-mergeable PR plan (probably one PR per primitive: lifecycle primitive, bedtime band, cascade ceiling). Each step independently mergeable; tests-green at every step. Land in a scope doc (`docs/v3/F66_SCOPE.md` or similar) before any implementation PR.
3. **Ship trivial items in parallel** — issues #5 (formatter) and #7 (validation flash) don't need to wait. Open small PRs whenever.
4. **Implementation PRs** — follow the scope doc, one collapsed primitive at a time. Each cascade-touching PR includes a Contaminated Data section per `feedback_write_path_fix_contamination_section`. §F58 / §F54 / §F62 / §F64 close as their respective primitive lands.

**Why fast-follow**: cascade bugs are eroding daily-use confidence; bottle disappearance (#6e) is a real data loss event.

**Estimated effort**: grill ~1–2 hr → plan ~1 hr → 3–5 implementation PRs of 1–3 hr each. Trivial items ship anytime.

---
