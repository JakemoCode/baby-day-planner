# §F64 — Nap→bedtime substitution fires too aggressively when projected end crosses threshold

**Source**: Jake, 2026-05-24 (sibling to §F63).

**Status**: `pending` — needs design grill before coding.

**What**: At `src/v3/engine/rules/naps.ts:121` the projected-nap → bedtime substitution rule fires if EITHER (a) `napStart >= threshold` OR (b) `napStart + napLen > threshold`. When (b) fires alone (nap starts well before threshold but its default-length end barely crosses), bedtime's `startTime` is set to `napStart` — converting a 4:46pm projected nap into "bedtime starting 4:46pm" with threshold at 7:00pm. ~5h early.

Jake's repro (2026-05-24): extended nap 3 such that projected nap 4 starts at 4:46pm with napLen big enough that 4:46pm + napLen > 7:00pm threshold → nap 4 converted to bedtime at 4:46pm. Visually wrong.

**DOMAIN.md §3 reference**: *"A nap that lands at or after the bedtime threshold IS bedtime."* The literal reading is case (a) — nap STARTING at/after threshold. Case (b) is an engineer extrapolation that's now misfiring.

**Design candidates** (grill to pick):
1. Tighten to case (a) only: `wouldCrossThreshold = napStart >= threshold`. A nap whose default end barely crosses stays a nap; subsequent wake_window gets clipped. May leak: nap that starts 10min before threshold and runs into evening, weird tiny wake_window between nap end and bedtime.
2. Keep case (b) trigger but set bedtime `startTime = max(napStart, threshold)`. Preserves "big nap = bedtime" intuition, kills the early-bedtime visual. Subtle engine change; affects projected bedtime startTime semantics elsewhere.
3. Bedtime fires only when `napStart` is "close enough" to threshold (e.g., `napStart >= threshold - napLen/2`, or `napStart >= threshold - some buffer`). Heuristic; needs threshold tuning.

**Pairing**: grill alongside §F58 (Dream Feed) and §F54 outcome (shipped via PR #241). Bottle/nap cascade rules are the canonical "step-back trigger zone" per `feedback_step_back_when_complex`.

**Why fast-follow**: visually wrong but not data-corrupting; the converted bedtime is still editable from the drawer. Real but rare-ish.

**Estimated effort**: grill (~30 min) → ~1-2 hr engine + tests once the rule shape is locked.
