# §F62 — Bottle cascade canCascade idempotency hole when §F54 seed snaps below wakeTime

**Source**: code-reviewer on PR #241, 2026-05-24.

**Status**: `pending`

**What**: In `projectBottleChain`'s cold-start branch (`src/v3/engine/rules/bottles.ts:336-343`), if `snap(seedTime)` returns a value `< wakeTime` (a recorded nap straddling wake pulls the seed backward), the function returns early without adding a projection. But `canCascade`'s cold-start predicate at L223 (`chainBottles.length < target`) still returns `true` — so the evaluator re-fires the rule indefinitely until it hits its fixed-point ceiling.

Pre-existed in spirit (the old `wakeBuffer` seed had the same shape), but PR #241's §F54 guard shifts the seed forward via `overnight.startTime + interval`, making the seed land deeper into morning naps that weren't a hazard before — so the failure mode is more reachable now.

**Fix shape**: in `canCascade`'s cold-start branch, replicate the seed-validity check from `projectBottleChain`. If the proposed seed snaps to `< wakeTime` or `>= cap`, return `false` (no more projections possible). Requires duplicating ~5 lines of seed logic in the predicate, OR factoring `computeColdStartSeed()` into a shared helper.

**Why fast-follow**: failure mode requires a specific data shape (recorded nap straddling wake + cold-start day + an overnight bottle close enough to wake to shift the seed into the nap region). Unlikely in dogfood; not a CRITICAL prod bug. Real but rare.

**Acceptance**:
- New `bottles.test.ts` case seeds a recorded nap straddling wake + an overnight bottle that would shift the seed into that nap; asserts `projectBottleChain` converges in one pass (or in a bounded number of passes set by the evaluator).
- `canCascade` returns `false` once seed placement is impossible.

**Estimated effort**: ~1-2 hr (small code change + careful test that locks the convergence semantics).

---


