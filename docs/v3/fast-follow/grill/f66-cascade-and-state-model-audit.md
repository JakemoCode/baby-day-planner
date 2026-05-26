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

Already-open entries that fold into this audit: **§F48, §F54, §F58, §F59, §F62, §F64**. Their individual specs stay as-is until the grill settles the model; if the model collapses change their fix shape, update them then.

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
