# §F44 — Auto-assign "Daycare" as event owner once a day has dropoff+pickup recorded

**Source**: Jake, 2026-05-19. **Nice-to-have**, explicitly NOT critical.

**Status**: `pending`

**What**: optional flavor of the deleted R21.3 behavior. When a Day has BOTH a recorded `daycare_dropoff` and `daycare_pickup` actual, projected events between those recorded times can opt-in to inherit a "Daycare" owner (would need a "Daycare" entry in `owners.other[]`). Different from the original R21.3 in two ways:

1. **Opt-in via settings flag** (e.g. `daycare.autoAssignOwner: boolean`) — default off.
2. **Triggered by recorded events**, not by enable+weekday — only fires once the user has actually committed dropoff and pickup actuals.

**Why deferred**: the §F43 visual indicator already gives the user the "this is at daycare" signal without owner-field pollution. Owner-stamping is only useful if a downstream consumer (analytics, history view, ownership reports) actually filters/groups by `owner.slot === "other" && otherId === daycareId`. Today no such consumer exists.

**Out of scope until needed**:
- Auto-creating the "Daycare" entry in `owners.other[]` (would re-introduce the auto-create logic we just deleted).
- Backfilling already-completed days.

**Estimated effort**: ~1 day if implemented from scratch with the settings flag + opt-in behavior + tests. ~½ day if we choose to make it global (no flag, just "if a Daycare other-owner exists").

---


