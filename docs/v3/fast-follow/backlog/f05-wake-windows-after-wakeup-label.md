# §F5 — Wake windows: include "after wake-up" before nap 1

**Source**: cutover dogfooding, 2026-05-09 — V3 settings page
(PR #64) labels wake-window rows "After nap 1, After nap 2, …"
but the FIRST wake window of the day is the gap between
ending-bedtime (morning wake-up) and nap 1, not the gap after
any nap.

**Status**: `pending`

**What**: relabel + reframe so the editor shows:
- "After wake-up" (morning) → drives nap 1's start
- "After nap 1" → drives nap 2's start
- "After nap 2" → drives nap 3's start
- …

The data shape (`wakeWindowsMinutes: number[]`) doesn't need to
change — `wakeWindowsMinutes[0]` already corresponds to the gap
after wake, `[1]` to after nap 1, etc., per R3.x. Only the
labels need fixing. Verify the engine treats index 0 as
post-wake (R3.1 / R4.1) and adjust if not.

**Why fast-follow, not in PR #64**: cosmetic labeling fix; not
blocking dogfooding (the math works). Worth doing as a small
cleanup PR after the cutover stabilizes.

**Estimated effort**: 30 minutes. Likely just a text change in
`OwnersConfigEditor`'s sibling `WakeWindowsRow` helper.

**Acceptance**:
- First wake-window row labeled "After wake-up" (or similar).
- Subsequent rows labeled by the nap they follow.
- Engine output unchanged for the same input array (verify via
  R3 / R4 unit tests still passing).

---


