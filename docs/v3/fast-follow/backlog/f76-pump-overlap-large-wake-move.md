# §F76 — Pump overlap-suppression misses a large wake-time move

**Source**: Jake, 2026-06-22 (`/diagnose` of the morning-pump duplicate).

**Status**: `pending` — residual edge of the R9.4 reality-wins fix.

**What**: R9.4 now drops a projected pump whose block overlaps a
committed (manually-entered) pump block (`src/v3/engine/rules/pumps.ts`,
`overlapsCommittedPump`). This kills the reported duplicate — the
wake-anchored first pump (R9.3) landing on top of a pump Kelly added at
wake — for realistic wake nudges, because two 25-min blocks still
intersect.

The residual: if wake is moved **more than one pump-block width** past
the manual pump (e.g. manual pump at 7:00–7:25, then wake corrected to
7:40), the re-anchored projection (7:40–8:05) no longer overlaps the
manual block, so a second morning pump reappears. The wake-anchored
projection has no delete affordance, so the user can't clear it.

**Why fast-follow, not now**: the common case (small wake correction)
is fixed; large jumps after already logging the morning pump are rare,
and the stray block is a forecast, not corrupt data.

**Design candidates** (grill before coding):
1. Identity-based: give the wake-anchored first pump a stable eventKey
   (e.g. `pump_first`) so a recorded morning pump suppresses it across
   any wake change. Robust, but changes persisted pump identity →
   one-day contamination (see the 2026-06-22 diagnose discussion).
2. Slot-based: suppress the wake-anchored projection if any committed
   pump exists between wake and the second scheduled pump. Simple, but
   risks absorbing a distinct overnight pump.
3. Give the wake-anchored pump a delete affordance so the user can
   dismiss a stray one (revisits the original "no delete concession"
   design choice).
