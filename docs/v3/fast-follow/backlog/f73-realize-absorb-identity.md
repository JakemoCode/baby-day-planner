# §F73 — Realize/relocate: identity-based absorption for far forecast moves

**Source**: PR #306 (realize/relocate fix), 2026-06-02. Code-reviewer finding
(conf 80) deferred after Jake review.

**Status**: `pending`

**What**: When a projected bottle is edited and recorded, the cascade absorbs the
forecast slot **adjacent** to the recorded time (window = one interval before the
anchor; see [`bottles.ts`](../../../../src/v3/engine/rules/bottles.ts) R5 realize
branch, and [BOTTLE_SPEC.md](../../BOTTLE_SPEC.md) §4). If the edit moves a forecast
by **more than one interval**, the cadence refills the vacated slot and the wrong
(adjacent) slot is absorbed — the original slot lingers.

Repro (wake 7:00, interval 180 ⇒ forecasts 7:10/10:10/13:10/16:10/19:10/22:10; edit
the **16:10** forecast → **19:30**):

```
now=14:00 → … 16:10[projected] 19:30[completed] 22:30[projected]   (lingering forecast — defensible)
now=19:35 → … 16:10[recorded]  19:30[completed] 22:30[projected]   (phantom RECORDED feed — wrong)
```

**Why fast-follow (not now)**: not reachable through sensible use. The full-day
cadence guarantees a forecast within ½ an interval of any clock time, so the
natural edit ("nudge the forecast near when I fed") is always a sub-half-interval
move — inside the window. Triggering the gap requires skipping the nearby forecast
and dragging a far one (a misclick, or a "reschedule by hand" intent that doesn't
exist today since "Log now" only moves the nearest forecast). The lingering slot is
also self-signalling. The proper fix threads the **edited slot's identity** through
the write path so the cascade suppresses exactly that slot regardless of distance —
which also brushes the [BOTTLE_SPEC §8](../../BOTTLE_SPEC.md) open question of what a
past, never-realized forecast means. Premature to build against a case no rational
edit path reaches.

**Trigger to promote to `now/`**: adding any affordance that *can* produce a
>1-interval forecast move (e.g. drag-to-reschedule on the timeline). That's the
moment identity-based absorption stops being speculative.

**Estimated effort**: ~half a day — carry original `startTime` (or slot id) on the
realized write, suppress the matching projected slot in `computeBottleProjectionTimes`,
tests across move distances + now-relative-to-slot positions.
