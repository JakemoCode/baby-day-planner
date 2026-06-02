# §F70 — Retire the `bottlesPerDay` field

**Source**: §F66 bottle rebuild (#303), 2026-06-02. Was the planned "PR-D" step
of the collapse; deferred as mechanical cleanup.

**Status**: `pending`

**What**: The engine already ignores `bottlesPerDay` — the full-day cascade fills
to the time cap, not a count (commit `81e2554`; see [BOTTLE_SPEC.md](../../BOTTLE_SPEC.md) §2).
The field is now vestigial but still lives in:

- `src/v3/schemas.ts` (the settings schema, ~line 254; and a stale comment near the
  dream-feed field that says dream feed "counts toward `bottlesPerDay`")
- settings UI / defaults / test fixtures that set it

**Why fast-follow**: harmless dead state — leaving it costs nothing functionally,
but it misleads readers into thinking a per-day bottle count still gates the
cascade (it doesn't; that would violate predicts-not-prescribes). Pure mechanical
removal: drop the field, the UI control, the default, and update fixtures + the
dream-feed comment.

**Estimated effort**: ~30 min, mechanical. No engine logic changes.
