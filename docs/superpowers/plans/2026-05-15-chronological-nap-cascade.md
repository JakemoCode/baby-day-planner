# Chronological Nap Cascade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the V3 nap cascade's `nap_N` slot-keyed matcher with a chronological walk; make FAB Add Nap purely additive (UUID); coerce post-threshold sleep to bedtime in projection; add Block z-index ordering.

**Architecture:** The cascade walks `wakeTime → WW → nap → WW → nap → ...` chronologically. Real naps (any eventKey shape) are consumed in start-time order at each rhythm position. `nap_N` becomes a stable identity for projected/rendered events but no longer a cascade primitive. Post-threshold real naps coerce to `type: "bedtime"` in the projection only (Firestore doc unchanged). Block stacking gets explicit `z-index` rules in `Block.module.css`.

**Tech Stack:** TypeScript, Vitest (test runner), React, CSS Modules. Engine in `src/v3/engine/`, render in `src/v3/components/Timeline/`.

**Spec:** `docs/superpowers/specs/2026-05-15-chronological-nap-cascade-design.md` (PR #144).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/v3/components/shared/createEventTemplate.ts` | FAB seed template | Modify: nap branch always returns UUID + label "Nap" |
| `src/v3/components/shared/createEventTemplate.test.ts` | FAB template tests | Modify: replace nap-numbering tests with always-additive assertion |
| `src/v3/engine/rules/naps.ts` | Sleep cascade | Modify: chronological walk; bedtime coercion of post-threshold real naps |
| `src/v3/engine/rules/naps.test.ts` | Cascade tests | Modify: add preceding naps to single-nap test setups; new tests for chronological insert + post-threshold coercion |
| `src/v3/components/Timeline/Block.module.css` | Block styling | Modify: add z-index rules for each block type |
| `src/v3/components/Timeline/Block.test.tsx` (new) | Z-index assertions | Create: assert each block type renders with the expected z-index |

---

## Task 1: FAB Add Nap → always UUID, always label "Nap"

**Files:**
- Modify: `src/v3/components/shared/createEventTemplate.test.ts`
- Modify: `src/v3/components/shared/createEventTemplate.ts:64-88`

- [ ] **Step 1: Replace existing nap tests with the new always-additive assertion**

In `createEventTemplate.test.ts`, REPLACE these three tests:
- "seeds a nap template as block-kind without endTime (drawer fills end)" (lines 90-103)
- "numbers a new nap by counting recorded naps" (lines 105-127)
- "off-pattern nap (beyond wakeWindowsMinutes.length) gets a UUID eventKey, not nap_N" (lines 129-161)

WITH a single block:

```typescript
describe("FAB Add Nap is purely additive (UUID + label 'Nap')", () => {
  // The FAB add-nap path is now additive only — never claims a cascade
  // slot, never numbers in the label. The cascade-time renumbering pass
  // handles display labels chronologically. Retro-record an actual rhythm
  // nap by editing the projected nap chip via the drawer.

  it("seeds a nap template as block-kind without endTime, UUID eventKey, label 'Nap'", () => {
    const tpl = buildCreateTemplate({
      type: "nap",
      dayId: "d-1",
      actuals: [],
      settings: settings(),
      nowMinutes: NOW,
    });
    expect(tpl.type).toBe("nap");
    expect(tpl.kind).toBe("block");
    expect(tpl.endTime).toBeUndefined();
    expect(tpl.eventKey).not.toMatch(/^nap_\d+$/);
    expect(tpl.eventKey).toMatch(/^nap_/); // UUID still has "nap_" prefix
    expect(tpl.label).toBe("Nap");
    expect(tpl.lifecycle).toEqual({ state: "projected" });
  });

  it("ignores recorded nap count — eventKey + label do not change with prior naps", () => {
    const recordedNap1: Event = {
      id: "n-1",
      dayId: "d-1",
      eventKey: "nap_1",
      type: "nap",
      kind: "block",
      startTime: 9 * 60,
      endTime: 10 * 60,
      label: "Nap 1",
      hasPutdown: false,
      lifecycle: { state: "completed", committedAt: 10 * 60 },
    };
    const tpl = buildCreateTemplate({
      type: "nap",
      dayId: "d-1",
      actuals: [recordedNap1],
      settings: settings(),
      nowMinutes: NOW,
    });
    expect(tpl.eventKey).not.toMatch(/^nap_\d+$/);
    expect(tpl.label).toBe("Nap");
  });

  it("ignores projected naps — eventKey + label do not change with prior projections", () => {
    const projected: Event[] = [1, 2, 3, 4].map((n) => ({
      id: `proj_nap_${n}`,
      dayId: "d-1",
      eventKey: `nap_${n}`,
      type: "nap",
      kind: "block",
      startTime: 9 * 60 + n * 60,
      label: `Nap ${n}`,
      hasPutdown: false,
      lifecycle: { state: "projected" },
    }));
    const tpl = buildCreateTemplate({
      type: "nap",
      dayId: "d-1",
      actuals: [],
      settings: settings({ wakeWindowsMinutes: [120, 135, 135, 150] }),
      nowMinutes: 22 * 60,
      projected,
    });
    expect(tpl.eventKey).not.toMatch(/^nap_\d+$/);
    expect(tpl.label).toBe("Nap");
  });
});
```

- [ ] **Step 2: Run the tests — expect them to fail**

Run: `pnpm vitest run src/v3/components/shared/createEventTemplate.test.ts`
Expected: 3 new tests fail (eventKey will match `^nap_\d+$` for the first two; label will be "Nap 1"/"Nap 2" not "Nap").

- [ ] **Step 3: Simplify the nap branch in `createEventTemplate.ts`**

REPLACE lines 64-88 (the entire `if (type === "nap") { ... }` block) with:

```typescript
  if (type === "nap") {
    // FAB Add Nap is purely additive — the new nap never claims a
    // cascade slot, never displaces a projection. The chronological
    // cascade in src/v3/engine/rules/naps.ts walks real naps in
    // start-time order regardless of eventKey shape, so the UUID here
    // inserts into the rhythm at the user's chosen time.
    //
    // Display labels (`Nap 1`, `Nap 2`, …) come from a render-time
    // chronological renumbering pass; the create-time label is just
    // "Nap".
    const napId = newEventId("nap");
    return {
      id: napId,
      dayId,
      eventKey: napId,
      type: "nap",
      kind: "block",
      label: "Nap",
      startTime: nowMinutes,
      hasPutdown: false,
      lifecycle: { state: "projected" },
    };
  }
```

- [ ] **Step 4: Run the tests — expect them to pass**

Run: `pnpm vitest run src/v3/components/shared/createEventTemplate.test.ts`
Expected: PASS for all FAB nap tests.

- [ ] **Step 5: Run the full createEventTemplate suite to confirm no regressions**

Run: `pnpm vitest run src/v3/components/shared/createEventTemplate.test.ts`
Expected: all tests pass (bottle/pump/extra tests untouched).

- [ ] **Step 6: Commit**

```bash
git add src/v3/components/shared/createEventTemplate.ts src/v3/components/shared/createEventTemplate.test.ts
git commit -m "$(cat <<'EOF'
refactor(v3): FAB Add Nap is purely additive (UUID + label "Nap")

Removes the slot-claiming branch from createEventTemplate's nap path.
The chronological cascade (next commit) will walk real naps by
startTime, so the UUID-keyed nap inserts into the rhythm at the user's
chosen time without displacing projections.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Audit existing nap tests for chronological semantics

The existing `naps.test.ts` has tests that record a single `nap_2` (or `nap_1`) with explicit slot-keyed eventKey and assert slot-keyed cascade behavior. Under chronological semantics, these test inputs become artificial — a real nap labeled `nap_2` with no `nap_1` recorded should chronologically be the FIRST nap. To preserve test intent (testing "what happens when slot N's nap arrives later than projected"), each test needs a recorded `nap_(N-1)` for chronological positioning.

**Files:**
- Modify: `src/v3/engine/rules/naps.test.ts`

- [ ] **Step 1: Audit each affected test and add preceding naps**

For each of the following tests in `naps.test.ts`, add a recorded `nap_1` to the actuals so the recorded `nap_2` lands at chronological position 2:

1. **"with a recorded nap_2 LATER than projected, ww_2 stretches to the recorded start"** (line 95):
   - Add `aRecordedNap({ id: "actual_nap_1", eventKey: "nap_1", start: 9 * 60, end: 10 * 60 })` to actuals.

2. **"with a recorded nap_2 EARLIER than projected, ww_2 shrinks to the recorded start"** (line 129):
   - Add same `aRecordedNap` for nap_1 ending at 10:00.

3. **"user-edited (overridden) nap_2 at a LATER time → ww_2 stretches to meet it"** (line 175):
   - Add `aRecordedNap({ id: "actual_nap_1", eventKey: "nap_1", start: 9 * 60, end: 10 * 60 + 30 })` so cursor is at 10:30 entering slot 2.

4. **"with a recorded nap_2 BEFORE the previous nap ended, ww_2 is zero-length (not inverted)"** (line 321):
   - Add `aRecordedNap({ id: "actual_nap_1", eventKey: "nap_1", start: 9 * 60, end: 10 * 60 })`. Recorded nap_2 at 9:30 is BEFORE nap_1's end (10:00) — the inversion-clamp test still applies because cursor advances to nap_1's end (10:00), then nap_2 at 9:30 is "before cursor" — clamp ww_2 to zero-length.

5. **"with a recorded nap_2 at the projected time, output is ww_1, nap_1 (proj), ww_2 (proj), nap_2 (recorded)"** (line 359):
   - Leave as-is — the assertion is about what eventKeys appear, not chronological positioning. Update expected eventKeys if naming changes.

6. Cascade-invariant tests (lines 401-531) — most already include the necessary preceding naps. Audit each `it()` block and confirm.

After each edit, the test should still describe the intended scenario clearly. If any test becomes incoherent under chronological semantics, leave a `// TODO(chronological-cascade)` comment explaining the issue and SKIP it for now (we'll address in Task 7).

- [ ] **Step 2: Run the test file — note which tests still fail**

Run: `pnpm vitest run src/v3/engine/rules/naps.test.ts`
Expected: tests added in Step 1 still pass under TODAY's slot-keyed cascade because the `nap_2` eventKey lookup still works. (We're pre-positioning the test setups for the cascade rewrite.)

- [ ] **Step 3: Commit**

```bash
git add src/v3/engine/rules/naps.test.ts
git commit -m "$(cat <<'EOF'
test(v3): add preceding naps to slot-keyed cascade tests

Pre-positions naps.test.ts setups so they remain coherent after the
cascade switches from slot-keyed (existingNapByKey.get('nap_N')) to
chronological. A recorded nap_2 with no nap_1 is artificial under
chronological semantics; explicit preceding naps make the test intent
clear and stable across the rewrite.

No behavior change; tests still pass under the current slot-keyed
cascade.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add failing test — FAB UUID nap inserts chronologically

**Files:**
- Modify: `src/v3/engine/rules/naps.test.ts`

- [ ] **Step 1: Add a new describe block at the bottom of `naps.test.ts`**

```typescript
describe("FAB-added nap (UUID eventKey) inserts into the rhythm chronologically", () => {
  // The FAB Add Nap path emits naps with UUID-shaped eventKeys (not
  // nap_N). The cascade walks real naps in startTime order regardless
  // of eventKey shape, so a UUID-keyed nap fills the next chronological
  // rhythm position and downstream projections re-cascade from it.

  it("UUID nap inserted between projected slots: downstream slots cascade from it", () => {
    // wakeTime 7:00, WW [120, 90, 90], napLen 60.
    // Without the UUID nap: ww_1 7-9, nap_1 9-10, ww_2 10-11:30, nap_2 11:30-12:30, ww_3 12:30-14, nap_3 14-15.
    // User adds a UUID nap at 13:30 via FAB. Expected:
    //   ww_1 7-9, nap_1 9-10, ww_2 10-11:30, nap_2 11:30-12:30,
    //   ww_3 12:30-13:30, [UUID nap at 13:30] for ~napLen,
    //   ww_4 14:30-?, nap_4 (or projected) cascades from 14:30.
    const uuidNap: Event = {
      id: "nap_abc123",
      dayId: "d-1",
      eventKey: "nap_abc123",
      type: "nap",
      kind: "block",
      startTime: 13 * 60 + 30,
      endTime: 14 * 60 + 30,
      label: "Nap",
      hasPutdown: false,
      lifecycle: { state: "started", committedAt: 13 * 60 + 30 },
    };

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 90, 90, 90],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 19 * 60,
      }),
      actuals: [uuidNap],
    });

    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: NAP_RULES },
    );

    // The UUID nap stays in the output exactly as recorded.
    const uuidOut = out.find((e) => e.id === uuidNap.id);
    expect(uuidOut).toBeDefined();
    expect(uuidOut!.startTime).toBe(13 * 60 + 30);
    expect(uuidOut!.eventKey).toBe("nap_abc123");

    // The wake window directly preceding it ends at the UUID nap's start.
    const wwBefore = out
      .filter((e) => e.type === "wake_window" && e.endTime === 13 * 60 + 30)
      .at(0);
    expect(wwBefore).toBeDefined();

    // The next wake window after the UUID nap starts at its end (14:30).
    const wwAfter = out
      .filter((e) => e.type === "wake_window" && e.startTime === 14 * 60 + 30)
      .at(0);
    expect(wwAfter).toBeDefined();
  });

  it("UUID nap inserted before any projected nap: it becomes nap_1 chronologically", () => {
    // wakeTime 7:00, WW [120, 90], napLen 60. UUID nap at 8:00.
    // Expected: ww_1 7-8, [UUID nap 8-9], ww_2 9-10:30, nap (projected) 10:30-11:30.
    const uuidNap: Event = {
      id: "nap_xyz789",
      dayId: "d-1",
      eventKey: "nap_xyz789",
      type: "nap",
      kind: "block",
      startTime: 8 * 60,
      endTime: 9 * 60,
      label: "Nap",
      hasPutdown: false,
      lifecycle: { state: "completed", committedAt: 9 * 60 },
    };

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 90],
        defaultNapLengthMinutes: 60,
      }),
      actuals: [uuidNap],
    });

    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: NAP_RULES },
    );

    // The UUID nap is preserved.
    expect(out.find((e) => e.id === uuidNap.id)).toBeDefined();

    // First wake window ends at the UUID nap's start (8:00).
    const ww1 = out.find((e) => e.type === "wake_window" && e.startTime === 7 * 60);
    expect(ww1).toBeDefined();
    expect(ww1!.endTime).toBe(8 * 60);
  });
});
```

- [ ] **Step 2: Run the new tests — expect them to fail under the current cascade**

Run: `pnpm vitest run src/v3/engine/rules/naps.test.ts -t "FAB-added nap"`
Expected: FAIL — current cascade ignores naps whose eventKey doesn't match `^nap_\d+$`, so the UUID nap is unconsumed and WWs follow the slot-keyed defaults.

- [ ] **Step 3: Commit (red, intentional failure documented)**

```bash
git add src/v3/engine/rules/naps.test.ts
git commit -m "$(cat <<'EOF'
test(v3): chronological-walk cascade scenarios (red)

Adds failing tests for FAB-added UUID-keyed naps inserting into the
rhythm chronologically. Will pass once the cascade rewrites to walk
real naps in startTime order regardless of eventKey shape.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Rewrite cascade — chronological walk

**Files:**
- Modify: `src/v3/engine/rules/naps.ts:47-143` (the `projectSleepCascade` function)

- [ ] **Step 1: Replace `projectSleepCascade` with a chronological-walk implementation**

REPLACE the entire `projectSleepCascade` function in `src/v3/engine/rules/naps.ts` (lines 47-143) with:

```typescript
function projectSleepCascade(ctx: Context, existing: Event[]): Event[] {
  const wakeTime = ctx.day.wakeTime;
  if (wakeTime === undefined) return existing;

  const wws = ctx.settings.wakeWindowsMinutes;
  const napLen = ctx.settings.defaultNapLengthMinutes;
  const threshold = ctx.settings.bedtimeThreshold;

  // All real naps (recorded/overridden) sorted chronologically by
  // startTime. The cascade consumes them in this order regardless of
  // eventKey shape — slot-keyed (`nap_N`) and UUID-keyed naps are
  // treated identically. Reality wins per DOMAIN.md §1.
  const realNaps = existing
    .filter((e) => isNap(e) && !isProjected(e))
    .slice()
    .sort((a, b) => a.startTime - b.startTime);

  // A manual bedtime (recorded/overridden) in actuals is authoritative.
  // It pins the cascade's terminator at its startTime — no projected
  // bedtime is emitted, and nothing is emitted past it.
  const manualBedtime = existing.find((e) => isBedtime(e) && !isProjected(e));

  const projected: Event[] = [];
  let cursor = wakeTime;
  let realIdx = 0;
  let prevNap: Event | undefined; // Previous nap in the rhythm — for short-nap-adjust.
  let rhythmN = 0; // Increments with every emitted WW (numbering).

  // Walk slots. Each iteration emits one WW (and possibly one nap, or
  // a bedtime that terminates the cascade). When real naps interleave
  // with projections, they consume rhythm positions in chronological
  // order; we may emit more WWs than `wws.length` if extra real naps
  // exist (extra WWs use the LAST configured wake-window length as the
  // best-available default).

  while (true) {
    rhythmN++;

    // Manual bedtime short-circuit: nothing emitted past authoritative
    // bedtime.
    if (manualBedtime && cursor >= manualBedtime.startTime) break;

    // Determine wake-window length for this rhythm position.
    const wwIdx = Math.min(rhythmN - 1, wws.length - 1);
    const baseWw = wws[wwIdx]!;
    const prevRecordedShort = isShortRecordedNap(prevNap, ctx);
    const wwMinutes = prevRecordedShort
      ? Math.max(0, baseWw - ctx.settings.shortNapAdjustmentMinutes)
      : baseWw;

    const wwStart = cursor;
    const naturalNapStart = wwStart + wwMinutes;

    // Pick the next real nap whose startTime is at or after the cursor.
    // Skip any real naps whose startTime predates the cursor (data
    // anomaly — they've been "absorbed" by an earlier rhythm position).
    while (realIdx < realNaps.length && realNaps[realIdx]!.startTime < cursor) {
      realIdx++;
    }
    const nextReal: Event | undefined = realNaps[realIdx];

    // Decide which nap fills this rhythm position:
    // - If a real nap exists AND its startTime is <= the projected nap's
    //   end (naturalNapStart + napLen), it fills this position.
    // - Otherwise, project this position normally.
    //
    // The "<= naturalNapStart + napLen" guard prevents a far-future real
    // nap from collapsing all intermediate WWs onto cursor; it lets the
    // cascade emit projected naps in the gaps.
    const consumeReal =
      nextReal !== undefined && nextReal.startTime <= naturalNapStart + napLen;

    const napStart = consumeReal
      ? Math.max(wwStart, nextReal!.startTime)
      : naturalNapStart;

    // Threshold check: if no manual bedtime AND we're not consuming a
    // real nap AND projected nap would reach/cross threshold → emit
    // projected bedtime, stop.
    const wouldCrossThreshold = napStart >= threshold || napStart + napLen > threshold;
    if (!manualBedtime && !consumeReal && wouldCrossThreshold) {
      projected.push(buildWakeWindow(ctx, rhythmN, wwStart, napStart));
      projected.push(buildProjectedBedtime(ctx, napStart, ctx.settings));
      break;
    }

    // Threshold coercion of a real nap: if no manual bedtime AND the
    // real nap we're about to consume starts at/after threshold → emit
    // bedtime in its place (engine-coerce per spec Option A). The doc
    // stays type=nap in Firestore; only the projection mutates.
    if (!manualBedtime && consumeReal && nextReal!.startTime >= threshold) {
      projected.push(buildWakeWindow(ctx, rhythmN, wwStart, napStart));
      projected.push(buildCoercedBedtime(ctx, nextReal!, ctx.settings));
      realIdx++;
      break;
    }

    // Manual bedtime sits between wwStart and napStart: truncate WW.
    if (manualBedtime && napStart >= manualBedtime.startTime) {
      projected.push(buildWakeWindow(ctx, rhythmN, wwStart, manualBedtime.startTime));
      break;
    }

    projected.push(buildWakeWindow(ctx, rhythmN, wwStart, napStart));

    if (consumeReal) {
      cursor = nextReal!.endTime ?? nextReal!.startTime + napLen;
      prevNap = nextReal;
      realIdx++;
    } else {
      const napEnd = napStart + napLen;
      projected.push(
        projectedEvent({
          ctx,
          id: `proj_nap_${rhythmN}`,
          eventKey: `nap_${rhythmN}`,
          type: "nap",
          kind: "block",
          startTime: napStart,
          endTime: napEnd,
          label: `Nap ${rhythmN}`,
        }),
      );
      cursor = napEnd;
      prevNap = projected[projected.length - 1];
    }

    // Loop termination safeguards: stop after walking through all
    // configured slots IF no remaining real naps to insert. Without
    // this guard the loop would continue indefinitely.
    if (rhythmN >= wws.length && realIdx >= realNaps.length) break;

    // Hard upper bound: never emit more than 2× configured slots
    // (defensive; should never hit with reasonable inputs).
    if (rhythmN >= wws.length * 2) break;
  }

  return [...existing, ...projected];
}

function buildCoercedBedtime(ctx: Context, realNap: Event, settings: Settings): Event {
  // Engine projection coerces a post-threshold real nap to bedtime.
  // The doc in Firestore stays type=nap; this is a projection-only
  // mutation. Uses the real nap's id/eventKey/owner/startTime so the
  // chip in the UI maps back to the same Firestore doc when tapped.
  return {
    ...realNap,
    type: "bedtime",
    label: "Bedtime",
    endTime: realNap.endTime ?? settings.defaultWakeTime + 24 * 60,
  };
}
```

The `buildWakeWindow`, `buildProjectedBedtime`, and `isShortRecordedNap` helpers stay as-is.

- [ ] **Step 2: Run the cascade tests — expect new tests to pass**

Run: `pnpm vitest run src/v3/engine/rules/naps.test.ts`
Expected: all tests pass, including the FAB-added nap tests from Task 3.

If existing slot-keyed tests fail, debug them one at a time:
- For each failure, check whether the test setup needs more preceding naps (Task 2 should have caught most).
- The `consumeReal` decision threshold (`startTime <= naturalNapStart + napLen`) may need adjustment if a far-future recorded `nap_N` is now being deferred to a later slot incorrectly.

- [ ] **Step 3: Run the FULL unit test suite to catch regressions in other areas (timeline render, hooks)**

Run: `pnpm test`
Expected: all 591+ tests pass.

If regressions appear in non-naps tests:
- Hook tests (`useV3*`, `useTimeline*`) that depend on cascade output — likely fine because output shape is unchanged for the slot-keyed scenarios.
- Render tests (`Timeline*`) — same.

- [ ] **Step 4: Commit**

```bash
git add src/v3/engine/rules/naps.ts
git commit -m "$(cat <<'EOF'
refactor(v3): chronological cascade walk (drops nap_N as cascade primitive)

The sleep cascade now walks real naps (recorded/overridden) by
startTime regardless of eventKey shape. nap_N becomes a stable
identity for projected events but no longer a cascade primitive —
FAB-added UUID naps insert into the rhythm at their chronological
position, downstream projections cascade from them.

Adds engine-coerce of post-threshold real naps to type=bedtime in the
projection (DOMAIN.md §3: "from the baby's perspective, bedtime is
just the last sleep of the day"). The Firestore doc stays type=nap;
the projection mutates only.

Replaces the slot-claiming logic added in 4231f39 (PR #143) with the
simpler chronological model described in
docs/superpowers/specs/2026-05-15-chronological-nap-cascade-design.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Add failing test — post-threshold real nap coerces to bedtime

**Files:**
- Modify: `src/v3/engine/rules/naps.test.ts`

- [ ] **Step 1: Add post-threshold coercion tests at the bottom of `naps.test.ts`**

```typescript
describe("Post-threshold real nap → bedtime in projection (DOMAIN.md §3)", () => {
  // Per DOMAIN.md §3: "any sleep that starts after the time at which
  // baby's circadian rhythm says 'bedtime' is likely to be just that."
  // The engine projection coerces a recorded/overridden nap whose
  // startTime ≥ bedtimeThreshold into a bedtime event (Option A in the
  // design spec). The Firestore doc stays type=nap; only the
  // projection mutates.

  it("real nap at startTime ≥ threshold projects as type=bedtime", () => {
    const lateNap: Event = {
      id: "nap_late",
      dayId: "d-1",
      eventKey: "nap_late",
      type: "nap",
      kind: "block",
      startTime: 19 * 60 + 30,
      endTime: 20 * 60 + 30,
      label: "Nap",
      hasPutdown: false,
      lifecycle: { state: "started", committedAt: 19 * 60 + 30 },
    };

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 90, 90, 90, 90],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 19 * 60,
        defaultWakeTime: 7 * 60,
      }),
      actuals: [lateNap],
    });

    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: NAP_RULES },
    );

    // The original nap doc still appears in the output (existing).
    const napDoc = out.find((e) => e.id === lateNap.id && e.type === "nap");
    expect(napDoc).toBeDefined();

    // A bedtime event has been emitted at the late-nap's startTime.
    const coercedBedtime = out.find(
      (e) => e.type === "bedtime" && e.startTime === 19 * 60 + 30,
    );
    expect(coercedBedtime).toBeDefined();
    expect(coercedBedtime!.id).toBe(lateNap.id); // maps back to same doc
    expect(coercedBedtime!.label).toBe("Bedtime");
  });

  it("post-coercion: cascade emits no naps or wake_windows past the coerced bedtime", () => {
    const lateNap: Event = {
      id: "nap_late",
      dayId: "d-1",
      eventKey: "nap_late",
      type: "nap",
      kind: "block",
      startTime: 19 * 60 + 30,
      endTime: 20 * 60 + 30,
      label: "Nap",
      hasPutdown: false,
      lifecycle: { state: "started", committedAt: 19 * 60 + 30 },
    };

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 90, 90, 90, 90, 90, 90],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 19 * 60,
        defaultWakeTime: 7 * 60,
      }),
      actuals: [lateNap],
    });

    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: NAP_RULES },
    );

    const bedtime = out.find((e) => e.type === "bedtime");
    expect(bedtime).toBeDefined();
    const orphan = out.filter(
      (e) => (e.type === "wake_window" || e.type === "nap") &&
             e.startTime >= bedtime!.startTime &&
             e.id !== lateNap.id, // exclude the original nap doc that gets coerced
    );
    expect(orphan).toHaveLength(0);
  });

  it("manual bedtime takes precedence over coercion (R7.7 still holds)", () => {
    const manualBedtime = aRecordedBedtime({
      id: "actual_bedtime",
      eventKey: "bedtime",
      start: 18 * 60,
      end: 30 * 60,
    });
    const lateNap: Event = {
      id: "nap_late",
      dayId: "d-1",
      eventKey: "nap_late",
      type: "nap",
      kind: "block",
      startTime: 19 * 60 + 30,
      endTime: 20 * 60 + 30,
      label: "Nap",
      hasPutdown: false,
      lifecycle: { state: "started", committedAt: 19 * 60 + 30 },
    };

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 90, 90, 90, 90],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 19 * 60,
        defaultWakeTime: 7 * 60,
      }),
      actuals: [manualBedtime, lateNap],
    });

    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: NAP_RULES },
    );

    // Only the manual bedtime exists; no coerced bedtime emitted.
    const bedtimes = out.filter((e) => e.type === "bedtime");
    expect(bedtimes).toHaveLength(1);
    expect(bedtimes[0]!.id).toBe(manualBedtime.id);
  });
});
```

- [ ] **Step 2: Run the new tests — expect them to PASS (Task 4 already implemented coercion)**

Run: `pnpm vitest run src/v3/engine/rules/naps.test.ts -t "Post-threshold real nap"`
Expected: PASS (the coercion logic was added in Task 4 Step 1; this task validates it explicitly).

If they fail, the coercion logic in `projectSleepCascade` needs adjustment — re-read Task 4's `if (!manualBedtime && consumeReal && nextReal!.startTime >= threshold)` block.

- [ ] **Step 3: Commit**

```bash
git add src/v3/engine/rules/naps.test.ts
git commit -m "$(cat <<'EOF'
test(v3): post-threshold nap coerces to bedtime in projection

Validates the engine-coerce behavior added in the chronological
cascade rewrite. A recorded/overridden nap whose startTime ≥
bedtimeThreshold projects as type=bedtime; the Firestore doc remains
type=nap.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Block z-index ordering

**Files:**
- Modify: `src/v3/components/Timeline/Block.module.css`
- Create: `src/v3/components/Timeline/Block.test.tsx`

- [ ] **Step 1: Write failing z-index assertion test**

Create `src/v3/components/Timeline/Block.test.tsx`:

```typescript
/**
 * Z-index ordering for timeline Block variants.
 *
 * Order (back to front):
 *   wake_window (1) → nap, bedtime (2) → putdown (3) → extra (4) → pump (5)
 *
 * Pumps must render IN FRONT of sleep blocks because they're a parallel
 * parent-schedule activity sized to max-content; they can't be hidden by
 * a same-time-range sleep block. Extras must render in front of nap/
 * bedtime because they're explicit user content.
 */

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Block } from "./Block";
import type { Event, OwnersConfig } from "../../schemas";

const owners: OwnersConfig = { parent1: { displayName: "P1" }, parent2: { displayName: "P2" } };

function blockEvent(overrides: Partial<Event> & { type: Event["type"] }): Event {
  return {
    id: "e-1",
    dayId: "d-1",
    eventKey: "e-1",
    kind: "block",
    startTime: 9 * 60,
    endTime: 10 * 60,
    label: "test",
    hasPutdown: false,
    lifecycle: { state: "projected" },
    ...overrides,
  } as Event;
}

const expected: Array<{ type: Event["type"]; z: string }> = [
  { type: "wake_window", z: "1" },
  { type: "nap", z: "2" },
  { type: "bedtime", z: "2" },
  { type: "extra", z: "4" },
  { type: "pump", z: "5" },
];

describe("Block z-index ordering", () => {
  for (const { type, z } of expected) {
    it(`type=${type} renders with z-index ${z}`, () => {
      const { getByTestId } = render(
        <Block
          event={blockEvent({ type })}
          topPx={0}
          heightPx={50}
          owners={owners}
          colorMode="type"
          past={false}
          leftPx={0}
          rightPx={0}
        />,
      );
      const el = getByTestId("timeline-block");
      const zIndex = window.getComputedStyle(el).zIndex;
      expect(zIndex).toBe(z);
    });
  }
});
```

- [ ] **Step 2: Run the test — expect failures (no z-index rules exist yet)**

Run: `pnpm vitest run src/v3/components/Timeline/Block.test.tsx`
Expected: FAIL — `zIndex` is `"auto"` for every type because no rule sets it.

- [ ] **Step 3: Add z-index rules to `Block.module.css`**

ADD this block to `src/v3/components/Timeline/Block.module.css` after the `.block` base rule (around line 35, after the closing brace of the base `.block` selector):

```css
/* === Z-index ordering ========================================
 * Order (back to front):
 *   wake_window (1) → nap, bedtime (2) → putdown (3) → extra (4) → pump (5)
 *
 * Pumps must render in front of sleep blocks because they're a
 * parallel parent-schedule activity sized to max-content. Extras
 * sit above nap/bedtime so user content never hides behind a
 * cascade-projected block.
 */
.block[data-type="wake_window"] { z-index: 1; }
.block[data-type="nap"],
.block[data-type="bedtime"]    { z-index: 2; }
.block[data-type="putdown"]    { z-index: 3; }
.block[data-type="extra"]      { z-index: 4; }
.block[data-type="pump"]       { z-index: 5; }
```

- [ ] **Step 4: Run the test — expect pass**

Run: `pnpm vitest run src/v3/components/Timeline/Block.test.tsx`
Expected: PASS for all 5 types.

- [ ] **Step 5: Run timeline render tests for regressions**

Run: `pnpm vitest run src/v3/components/Timeline/`
Expected: all timeline tests pass (z-index is purely additive — existing visual tests should be unaffected).

- [ ] **Step 6: Commit**

```bash
git add src/v3/components/Timeline/Block.module.css src/v3/components/Timeline/Block.test.tsx
git commit -m "$(cat <<'EOF'
fix(v3): explicit z-index ordering for timeline Block variants

Block.module.css's header comment declared z-index intent ("z 2",
"z 3") but no rules were ever written. Pumps consequently rendered
behind sleep blocks because DOM order alone determined stacking.

Stacking order (back to front):
  wake_window (1) → nap, bedtime (2) → putdown (3) → extra (4) → pump (5)

Pumps must be on top because they're parent-schedule blocks sized to
max-content and inset right; they can't be hidden by a same-time
sleep block. Extras above nap/bedtime so user content is never
covered by cascade projections.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Full test sweep + manual click-test verification

- [ ] **Step 1: Run full unit + integration test suites**

Run: `pnpm test && pnpm test:integration`
Expected: all tests pass. If any fail, debug per the cascade-rewrite or z-index changes.

- [ ] **Step 2: Run pre-push verification**

Run: `pnpm typecheck && pnpm lint && pnpm format:check`
Expected: all green.

- [ ] **Step 3: Manual click-test the original Jake-reported scenarios**

Wipe the local emulator first (it's contaminated from PR #143 click-tests):

```bash
# In a separate shell, restart the emulator to clear state.
pnpm emulator:reset 2>/dev/null || rm -rf .firebase/emulator-data
pnpm dev:emulators &
```

Then in the browser:

1. **FAB Add Nap during the day** (verifies bug 1 fix):
   - Configure a day with default settings (5 WWs).
   - FAB → Add Nap → set time to ~3:00 PM.
   - Expected: new chip labeled "Nap" (no number); existing projected chips do NOT relabel; downstream projections cascade from the new nap (visible later shifts).

2. **FAB Add Nap past bedtime threshold** (verifies bug 1 + coercion):
   - Settings → set `bedtimeThreshold` to a time before now (e.g. 14:00).
   - FAB → Add Nap → set time to e.g. 8:00 PM.
   - Expected: new chip renders with bedtime styling (sage tint, darker stroke, label "Bedtime"); cascade emits nothing past it.

3. **Pump block layering** (verifies bug 3):
   - Add a pump that overlaps a nap or bedtime block in time.
   - Expected: pump renders IN FRONT of the sleep block (visible, not hidden behind).

If any scenario fails, debug by inspecting the engine output via React DevTools or the dashboard's projection panel.

- [ ] **Step 4: Push the branch**

```bash
git push -u origin feat/v3-chronological-nap-cascade
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create --title "feat(v3): chronological nap cascade + Block z-index" --body "$(cat <<'EOF'
## Summary

Implements the design spec from PR #144 (`docs/superpowers/specs/2026-05-15-chronological-nap-cascade-design.md`):

1. **FAB Add Nap is purely additive** — UUID eventKey, label "Nap" (no number), never claims a cascade slot.
2. **Cascade walks chronologically** — drops `nap_N` as a cascade primitive; real naps consumed in startTime order regardless of eventKey shape.
3. **Post-threshold real naps coerce to bedtime in projection** — DOMAIN.md §3 ("from the baby's perspective, bedtime is just the last sleep of the day"). Doc stays `type: "nap"` in Firestore; only the projection mutates.
4. **Block z-index ordering** — fills the documented intent in `Block.module.css`'s header comment; pumps now render above sleep blocks.

Replaces `4231f39`'s slot-cap exception (PR #143) with the simpler chronological model.

## Tests

- RTL: 591+ unit tests passing (Block z-index assertions added).
- Engine: chronological cascade tests + post-threshold coercion + cascade-invariant scenarios all green.
- Integration: 28 emulator-backed tests passing.
- Manual click-test (per PR body steps below).

## Click-test steps

1. **FAB Add Nap mid-day** — new chip labeled "Nap" (no number); existing chips don't relabel; downstream projections cascade from the new nap.
2. **FAB Add Nap past `bedtimeThreshold`** (e.g. set threshold to 14:00, add nap at 20:00) — new chip renders as bedtime (sage tint, darker stroke, label "Bedtime"); no naps/WWs emitted past it.
3. **Pump overlapping a nap/bedtime block** — pump renders IN FRONT (visible, not hidden behind sleep block).

## Contaminated data

None for production. Local emulator state was contaminated from PR #143 click-tests; wipe before verifying (`pnpm emulator:reset` or remove `.firebase/emulator-data`).

## Checklist
- [x] Tests passing
- [x] Loading, error, and empty states implemented (no UI surface changes)
- [x] Click-test steps documented above

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Confirm PR opens cleanly**

The pre-push hook will run typecheck, lint, format:check, unit tests, integration tests. Expected: all green.

---

## Self-Review Notes

**Spec coverage:**
- Fix 1 (chronological cascade): Tasks 1, 3, 4 ✓
- Fix 2 (z-index): Task 6 ✓
- Fix 3 (tests): integrated into Tasks 1, 3, 5, 6 ✓
- Post-threshold coercion: Tasks 4, 5 ✓
- Existing test audit (out-of-scope footnote): Task 2 ✓

**Risk callouts:**
- Task 4's `consumeReal` heuristic (`nextReal.startTime <= naturalNapStart + napLen`) is the load-bearing decision for "does this real nap fill THIS slot or a later one." The boundary may need tuning if existing tests reveal a misfit.
- Coerced bedtime reuses the real nap's `id`/`eventKey` — render layer click-handlers that route by `type` (nap vs bedtime drawer) need to handle the case where a tap on a "bedtime"-flavored chip opens the nap drawer (because the doc is type=nap). Audit `EventEditDrawerV3.tsx` if that path matters.
