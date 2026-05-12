# Dashboard Start/End Nap Button — Open Spec

> Status: **DEFERRED.** The button has been reverted to its `main` baseline
> (no ordinal in label, no short-nap confirm) and gets its own focused PR.
> This doc captures the desired behavior so a future session can pick it
> up without re-deriving the requirements.

## Why deferred

The Start/End Nap button sits at the intersection of three problems that
each need their own answer:

1. **What ordinal does the button show?** ("Start Nap N" — for what N?)
2. **What counts as a "recorded" nap** for the purposes of incrementing N?
3. **What guard rails prevent invalid nap data** entering the system?

These got tangled with the Timeline v2 redesign and produced a string of
"this fixed A but broke B" cycles. Pulling them out gives the next pass a
clean slate.

## Desired behavior (Jake's words, paraphrased)

### Label

- When **no nap is in progress**: button reads `Start Nap N` where `N` is
  the next nap number to be recorded today.
- When **a nap IS in progress**: button reads `End Nap M` where `M` is the
  ordinal of the in-progress nap (parsed from its `eventKey`, e.g.
  `nap_2 → 2`).

### "What is N?" — the source-of-truth question

`N = (count of nap slots that have been actually recorded today) + 1`.

A "recorded" nap is one the user explicitly committed a time for:
- Pressed dashboard `Start Nap` (`recorded: true`, status: `actual`)
- Pressed dashboard `End Nap` (`recorded: true`, status: `completed`)
- Created via FAB on `/timeline` and saved with a time (`recorded: true`)
- Edited a projected nap via the drawer and changed its time
  (`recorded: true`)

**Not** counted as recordings:
- Owner-only annotations (`recorded: false`) — user assigned an owner to
  a not-yet-happened nap. Engine recalculates time freely.
- Pure projections (engine output, never written to Firestore).
- Legacy `"overridden"` docs without an explicit `recorded` field — the
  Firestore converter coerces these via `deriveRecorded`.

The `recorded: boolean` field on `Event` (added during Timeline v2 work)
is the canonical signal. Dashboard counters should use:

```ts
const uniqueRecordedKeys = (type: Event["type"]) => {
  const seen = new Set<string>();
  for (const e of actuals) {
    if (e.type !== type) continue;
    if (!e.recorded) continue;
    seen.add(e.eventKey);
  }
  return seen.size;
};
const nextNapNumber = uniqueRecordedKeys("nap") + 1;
```

This dedupes the Start+End pair (two docs with the same `eventKey`).

### Short-nap accidental-tap guard

If user presses `End Nap` less than **5 minutes** after `Start Nap`,
show a `window.confirm`:

> "That's only X minute(s) since you started this nap. End it anyway?"

If they cancel, abort the recording.

This prevents the "1-minute nap" data poisoning that's invisible on the
timeline (zero-height block) and hard to fix without surgical Firestore
edits.

Pair with the existing 24px `MIN_BLOCK_HEIGHT` floor in TimelineV2 so
*if* a tiny nap does land, it's still tappable for the drawer.

### Late-nap scenario (Daycare runs naps late)

If projected Nap 2 was supposed to start at 10:45 AM and Daycare doesn't
press Start until 1:30 PM:

- Button shows `Start Nap 2` (next ordinal, not "Nap 3").
- The recorded actual has `eventKey: "nap_2"`, `startTime: "13:30"`,
  `recorded: true`.
- `applyNapActuals` stretches the wake window before this nap (WW2) so
  it ends at 13:30 — closes the visual gap. Already implemented in the
  v2 engine; this is just the corresponding button label.

## What's already in place (don't redo)

- `Event.recorded: boolean` field, persisted, derived in converter for
  legacy docs (`src/domain/types.ts`).
- `applyNapActuals` distinguishes `recorded: true` (pin time) from
  `recorded: false` (carry owner only, time stays cascade-driven).
- `applyNapActuals` always-clamp WW behavior (stretches forward AND
  shrinks back to match actual nap start).
- Drawer `formToEvent` sets `recorded: true` when time fields change,
  preserves `recorded: source.recorded` otherwise (so once-recorded
  stays recorded across re-edits).
- Drawer overlap validation only blocks against `recorded: true` naps.
- 24px min-block-height in `TimelineV2` for tappable tiny naps.

## What was reverted (the focus of the future PR)

- `src/components/Dashboard/NapActionButton.tsx` — back to "Start Nap
  Now" / "End Nap" labels, no ordinal, no confirm dialog.
- `src/components/Dashboard/NapActionButton.test.tsx` — back to base
  assertions (no ordinal text checks).
- The dashboard's `nextBottleNumber` / `nextNapNumber` computation
  remains `recorded`-based (that part is shared with other dashboard
  features and was left intact).

## Implementation plan for the future PR

1. **Re-add the ordinal to the button label**, parsing `inProgressNap`'s
   eventKey for "End Nap M".
2. **Re-add the 5-min `window.confirm` guard** in the End-Nap branch of
   `handleClick`.
3. **Update `NapActionButton.test.tsx`** to assert "Start Nap 1" /
   "End Nap 1" labels.
4. **Sanity-test the late-nap scenario** end-to-end:
   - Skip projected Nap 2 entirely.
   - Wait until 1:30 PM (past projected Nap 2's window).
   - Verify button reads "Start Nap 2" (not "Nap 3").
   - Press it. Verify the recorded doc has eventKey `nap_2`, recorded:
     true, and the timeline cascades correctly.
5. **Sanity-test the short-nap guard**:
   - Press Start Nap. Press End Nap immediately.
   - Confirm dialog appears. Cancel.
   - Wait ≥5 min, press End Nap. No confirm.
6. **Add Vitest tests** for both behaviors.

## Why this lives in its own PR

The button's behavior depends on:
- A clean `recorded` field semantic (now in place).
- Drawer / engine respecting `recorded` (now in place).
- `applyNapActuals` cascade behavior (now in place).

With those locked, the button itself is a 30-line change + tests.
Trying to fix all of these together in one PR was the source of the
"this fixed A but broke B" cycles. Sequencing matters.
