# §F58 — Dream Feed: render at a configurable default time, always visible

**Source**: Jake, 2026-05-23.

**Status**: `pending` (needs design grill before coding)

**What**: Currently, the dream feed bottle doesn't reliably display on the timeline — Jake has to manually add one. Proposed shape: add a `defaultTime` field to Dream Feed settings; the dream feed bottle always renders at that time, and can be edited/adjusted (record actual time, skip, etc.).

**Open design questions** (grill before coding):
- Is the dream feed additive, or does it re-phase the surrounding cascade? (Note: §F74 removed the `bottlesPerDay` daily-count budget, so the old "counts toward the total" framing is moot — the cascade fills the day regardless.)
- If the baby wakes BEFORE the dream feed time (e.g. baby wakes at 11:30pm and dream feed default is 11pm), what happens? Skip it, shift it, or render it anyway?
- Does enabling the dream feed surface a *new* event type or just a flagged bottle?
- How does the "skip" path interact with the cascade for the next-morning bottle?

**Why fast-follow / blocking**: currently Jake's manually adding a bottle every night, so this is real friction. But the model has a million edge cases — get the design crisp before shipping anything.

**Estimated effort**: grill (~30 min) → ~1-2 hr settings field + engine + tests.

---


