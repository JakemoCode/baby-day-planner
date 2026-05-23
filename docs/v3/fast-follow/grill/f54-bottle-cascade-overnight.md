# §F54 — Overnight bottle cascade should recalc when overnight bottle is close to wake

**Source**: Jake, 2026-05-23.

**Status**: `pending` (engine-shaped; may need a brief grill before coding)

**What**: If an overnight bottle (e.g. 6oz at 5am) falls within one cascade "rule" of the projected first bottle of the day (e.g. 6oz at 7am wake), the bottle cascade should reflect what actually happened — baby isn't going to want 6oz two hours after 6oz. Today, the cascade ignores the overnight bottle and schedules the morning bottle as if the baby woke from a full sleep.

**Hypothesis**: the cascade's "anchor" is the first wake-up of the day, not the most-recent actual bottle. The fix likely involves looking back across the night boundary to find the most-recent actual bottle event, and shifting/sizing the morning bottle off THAT anchor.

**Risks**: tread carefully — bottle rules are the canonical "step back" trigger zone (per `feedback_step_back_when_complex` + 2026-05-12 simplification). Grill the model before coding so we don't add another patch-on-patch rule.

**Estimated effort**: grill (~30 min) → ~1-2 hr engine + tests.

---


