# Physiology Cascade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the physiology-cascade model per spec PR #146 — cascade extends until bedtime threshold, FAB drops nap option, past-threshold drawer-edit prompts "Change to bedtime?", dashboard CTA swaps to "Start Bedtime Now" at threshold, Block z-index salvaged.

**Architecture:** The cascade walks `while true` from `wakeTime`, alternating `wake_window → nap`, using `wakeWindowsMinutes[Math.min(rhythmN-1, wws.length-1)]` for WW length (repeats last value past array end). Stops when next projected nap would cross `bedtimeThreshold` → emit bedtime. Slot-keyed real naps (`nap_N` eventKey) still claim slot N regardless of `wws.length`. No additive UUID path. FAB's nap option removed; parents adjust via drawer-edit on existing chips. Drawer Save fires "Change to bedtime?" prompt when nap startTime crosses threshold; Yes deletes nap doc + creates bedtime doc.

**Tech Stack:** TypeScript, Vitest, React, CSS Modules. Engine in `src/v3/engine/`, FAB/drawer/dashboard in `src/v3/components/` and `src/app/(authed)/`.

**Spec:** `docs/superpowers/specs/2026-05-15-physiology-cascade-design.md` (PR #146).

---

## File Structure

| File | Action | Why |
|---|---|---|
| `src/v3/engine/rules/naps.ts` | Modify | Cascade rewrite: while-loop, repeat-last-WW, drop slot cap |
| `src/v3/engine/rules/naps.test.ts` | Modify | Delete R7.4b "no nap_5" test; add cascade-extends-past-array tests |
| `src/v3/components/shared/createEventTemplate.ts` | Modify | Delete `type === "nap"` branch entirely; remove `nextFreeSlot('nap', ...)` callers |
| `src/v3/components/shared/createEventTemplate.test.ts` | Modify | Delete all nap tests; rename describe block |
| `src/components/shared/FABTypePicker.tsx` | Modify | Remove "nap" option from the picker list |
| `src/components/shared/FABTypePicker.test.tsx` | Modify | Delete the test for nap option being rendered (if present) |
| `src/v3/components/Timeline/Block.module.css` | Modify | Cherry-pick z-index rules from closed PR #145 commit `96e5531` |
| `src/v3/components/Dashboard/NapActionButton.tsx` | Modify | Conditional CTA swap when `nowMinutes ≥ bedtimeThreshold` → "Start Bedtime Now"; remove UUID fallback |
| `src/v3/components/Dashboard/NapActionButton.test.tsx` | Modify | Add tests for CTA swap; remove tests for UUID fallback |
| `src/v3/components/shared/EventEditDrawerV3.tsx` | Modify | Add past-threshold confirm flow in `handleSave` for nap |
| `src/v3/components/shared/EventEditDrawerV3.test.tsx` (existing) | Modify | Add tests for prompt fire + accept/reject paths |
| `src/v3/components/shared/formToEvent.ts` | Modify (if needed) | Support producing a bedtime event from a nap form when prompt-accepted |
| `DOMAIN.md` | Modify | §1 cadence-sequence clarification; §3 overnight-wake clarification |
| `docs/v3/ENGINE_SPEC.md` | Modify | Replace R3.1 description; drop R7.4b |
| `docs/v3/FAST_FOLLOW.md` | Modify | Close out §F8 (folded into this campaign) |

---

## Task 1: Engine cascade rewrite — cascade extends until threshold

**Files:**
- Test: `src/v3/engine/rules/naps.test.ts`
- Modify: `src/v3/engine/rules/naps.ts`

- [ ] **Step 1: Add failing test — cascade extends past `wakeWindowsMinutes.length`**

Append this describe block to `src/v3/engine/rules/naps.test.ts`:

```typescript
describe("Cascade extends past wakeWindowsMinutes.length (physiology cascade)", () => {
  // Per docs/superpowers/specs/2026-05-15-physiology-cascade-design.md:
  // The wakeWindowsMinutes array is a CADENCE sequence, not a slot
  // count. The cascade walks until the next projected nap would cross
  // bedtimeThreshold, using the last WW value past the configured
  // array.

  it("with wws=[120], cascade emits nap_1, nap_2, nap_3, ... until threshold", () => {
    // wakeTime 7:00, wws=[120], napLen 60, threshold 19:00.
    // Each rhythm position uses WW=120 (repeats last):
    //   ww_1 7-9, nap_1 9-10, ww_2 10-12, nap_2 12-13, ww_3 13-15,
    //   nap_3 15-16, ww_4 16-18, nap_4 18-19 → threshold reached →
    //   bedtime at 19:00 (nap_4 would cross threshold).
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 19 * 60,
        defaultWakeTime: 7 * 60,
      }),
      actuals: [],
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

    // Multiple naps emitted past the single-element array.
    expect(out.find((e) => e.eventKey === "nap_1")).toBeDefined();
    expect(out.find((e) => e.eventKey === "nap_2")).toBeDefined();
    expect(out.find((e) => e.eventKey === "nap_3")).toBeDefined();

    // Bedtime terminates the cascade.
    const bedtime = out.find((e) => e.type === "bedtime");
    expect(bedtime).toBeDefined();
    expect(bedtime!.startTime).toBeGreaterThanOrEqual(19 * 60);
  });

  it("with wws=[120, 90], cascade uses 90-min WW from position 2 onward", () => {
    // wakeTime 7:00, wws=[120, 90], napLen 60, threshold 19:00.
    //   ww_1 7-9, nap_1 9-10 (WW=120)
    //   ww_2 10-11:30, nap_2 11:30-12:30 (WW=90)
    //   ww_3 12:30-14, nap_3 14-15 (WW=90, repeated)
    //   ww_4 15-16:30, nap_4 16:30-17:30 (WW=90)
    //   ww_5 17:30-19, projected nap would start at 19:00 → bedtime.
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 90],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 19 * 60,
        defaultWakeTime: 7 * 60,
      }),
      actuals: [],
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

    const nap3 = out.find((e) => e.eventKey === "nap_3");
    expect(nap3).toBeDefined();
    expect(nap3!.startTime).toBe(14 * 60);
    expect(nap3!.endTime).toBe(15 * 60);

    const nap4 = out.find((e) => e.eventKey === "nap_4");
    expect(nap4).toBeDefined();
    expect(nap4!.startTime).toBe(16 * 60 + 30);

    const bedtime = out.find((e) => e.type === "bedtime");
    expect(bedtime).toBeDefined();
    expect(bedtime!.startTime).toBe(19 * 60);
  });

  it("slot-keyed recorded nap_5 anchors slot 5 even when wws.length=2", () => {
    // wws=[120, 90], recorded nap_5 at 16:00-17:00. The cascade walks
    // chronologically; at rhythm position 5 it picks up the slot-keyed
    // nap_5 and anchors there.
    const recordedNap5 = aRecordedNap({
      id: "actual_nap_5",
      eventKey: "nap_5",
      start: 16 * 60,
      end: 17 * 60,
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 90],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 19 * 60,
        defaultWakeTime: 7 * 60,
      }),
      actuals: [recordedNap5],
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

    const napFive = out.find((e) => e.id === recordedNap5.id);
    expect(napFive).toBeDefined();
    expect(napFive!.startTime).toBe(16 * 60);

    // Wake window 5 ends at the recorded nap_5's start.
    const ww5 = out.find((e) => e.eventKey === "wake_window_5");
    expect(ww5).toBeDefined();
    expect(ww5!.endTime).toBe(16 * 60);
  });
});
```

- [ ] **Step 2: Run tests — expect new tests to fail**

Run: `pnpm vitest run src/v3/engine/rules/naps.test.ts -t "Cascade extends past"`
Expected: FAIL — current cascade loops `for (let i = 0; i < wws.length; i++)` and stops at `wws.length`.

- [ ] **Step 3: Delete the now-obsolete R7.4b "no nap_5 emitted" test**

In `src/v3/engine/rules/naps.test.ts`, find the test:

> `"with a 5-WW cascade that would project nap_5 at 22:00, only bedtime and earlier slots survive"` (around line 604)

DELETE this entire `it()` block. The premise (slot-count cap) no longer exists. Adjacent invariant ("no orphan wake_window emitted past bedtime") stays.

- [ ] **Step 4: Replace `projectSleepCascade` with the while-loop cascade**

In `src/v3/engine/rules/naps.ts`, REPLACE the `for (let i = 0; i < wws.length; i++)` loop body with a `while (true)` loop using a `rhythmN` counter. Full function:

```typescript
function projectSleepCascade(ctx: Context, existing: Event[]): Event[] {
  const wakeTime = ctx.day.wakeTime;
  if (wakeTime === undefined) return existing;

  const wws = ctx.settings.wakeWindowsMinutes;
  const napLen = ctx.settings.defaultNapLengthMinutes;
  const threshold = ctx.settings.bedtimeThreshold;

  if (wws.length === 0) return existing;

  // Slot-keyed real naps (`nap_N` eventKey) anchor slot N. Reality
  // wins per DOMAIN.md §1. No additive UUID path under the physiology
  // cascade — the FAB has no nap option.
  const existingNapByKey = new Map<string, Event>();
  for (const e of existing) {
    if (isNap(e) && /^nap_\d+$/.test(e.eventKey)) {
      existingNapByKey.set(e.eventKey, e);
    }
  }

  const manualBedtime = existing.find((e) => isBedtime(e) && !isProjected(e));

  const projected: Event[] = [];
  let cursor = wakeTime;
  let prevNap: Event | undefined;
  let rhythmN = 0;

  // Defensive cap: under reasonable inputs the cascade terminates at
  // bedtime threshold within a single calendar day. The cap prevents
  // pathological loops (e.g., threshold misconfigured beyond 48h).
  const HARD_CAP = 48;

  while (rhythmN < HARD_CAP) {
    rhythmN++;
    const n = rhythmN;

    // WW length: configured value for slots 1..wws.length; repeat the
    // last value beyond that — physiology, not config, ends the day.
    const baseWw = wws[Math.min(n - 1, wws.length - 1)]!;
    const prevRecordedShort = isShortRecordedNap(prevNap, ctx);
    const wwMinutes = prevRecordedShort
      ? Math.max(0, baseWw - ctx.settings.shortNapAdjustmentMinutes)
      : baseWw;

    const wwStart = cursor;
    if (manualBedtime && wwStart >= manualBedtime.startTime) break;

    const existingNap = existingNapByKey.get(`nap_${n}`);
    const napStart = existingNap
      ? Math.max(wwStart, existingNap.startTime)
      : wwStart + wwMinutes;

    const wouldCrossThreshold = napStart >= threshold || napStart + napLen > threshold;
    if (!manualBedtime && !existingNap && wouldCrossThreshold) {
      projected.push(buildWakeWindow(ctx, n, wwStart, napStart));
      projected.push(buildProjectedBedtime(ctx, napStart, ctx.settings));
      break;
    }

    if (manualBedtime && napStart >= manualBedtime.startTime) {
      projected.push(buildWakeWindow(ctx, n, wwStart, manualBedtime.startTime));
      break;
    }

    projected.push(buildWakeWindow(ctx, n, wwStart, napStart));

    if (existingNap) {
      cursor = existingNap.endTime ?? existingNap.startTime + napLen;
      prevNap = existingNap;
    } else {
      const napEnd = napStart + napLen;
      const projNap = projectedEvent({
        ctx,
        id: `proj_nap_${n}`,
        eventKey: `nap_${n}`,
        type: "nap",
        kind: "block",
        startTime: napStart,
        endTime: napEnd,
        label: `Nap ${n}`,
      });
      projected.push(projNap);
      cursor = napEnd;
      prevNap = projNap;
    }
  }

  return [...existing, ...projected];
}
```

- [ ] **Step 5: Run all naps tests**

Run: `pnpm vitest run src/v3/engine/rules/naps.test.ts`
Expected: PASS — including new tests, existing slot-keyed scenarios, and the cascade invariant.

- [ ] **Step 6: Run full suite to catch regressions in hooks/render**

Run: `pnpm test`
Expected: all passing.

- [ ] **Step 7: Commit**

```bash
git add src/v3/engine/rules/naps.ts src/v3/engine/rules/naps.test.ts
git commit -m "$(cat <<'EOF'
refactor(v3): cascade extends until bedtime threshold (physiology cascade)

The wakeWindowsMinutes array becomes a cadence sequence rather than
a per-day slot count. The cascade walks `while rhythmN < HARD_CAP`,
using wws[min(n-1, wws.length-1)] for WW length (last value repeated
past the configured array). Naps continue until the next projected
nap would cross bedtimeThreshold.

Slot-keyed real naps (nap_N eventKey) anchor slot N regardless of
wws.length — preserves drawer-edit + Start Nap promotion semantics.

Drops R7.4b's "no nap_5 emitted" assumption — the cap doesn't exist
under the new model. The cascade invariant still holds across all
scenarios.

Per docs/superpowers/specs/2026-05-15-physiology-cascade-design.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Remove nap branch from createEventTemplate

**Files:**
- Modify: `src/v3/components/shared/createEventTemplate.ts`
- Modify: `src/v3/components/shared/createEventTemplate.test.ts`

- [ ] **Step 1: Update tests — assert nap is no longer a supported type**

In `createEventTemplate.test.ts`, DELETE all three nap tests:
- "seeds a nap template as block-kind without endTime"
- "numbers a new nap by counting recorded naps"
- "off-pattern nap (beyond wakeWindowsMinutes.length) gets a UUID eventKey"

Replace with one assertion that documents the removal:

```typescript
describe("FAB has no nap option (physiology cascade)", () => {
  // Per spec PR #146: parents adjust by editing existing projected
  // nap chips, never by adding new naps via FAB. The "nap" branch in
  // buildCreateTemplate is removed; the picker no longer offers it.
  // A defensive assertion confirms the type union is correct at
  // compile time + that calling with type='nap' throws at runtime so
  // any stray caller surfaces immediately.

  it("throws if called with type='nap'", () => {
    expect(() =>
      buildCreateTemplate({
        // @ts-expect-error — nap is no longer a CreatableType.
        type: "nap",
        dayId: "d-1",
        actuals: [],
        settings: settings(),
        nowMinutes: NOW,
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Edit `createEventTemplate.ts` — remove nap from union + branch**

REPLACE the `CreatableType` type:

```typescript
export type CreatableType = "bottle" | "pump" | "extra";
```

DELETE the `if (type === "nap") { ... }` block entirely (lines 64-88 in current main).

The function falls through bottle / pump / extra branches; a stray "nap" passes the union check but produces no return → TypeScript will flag, and runtime will return `undefined`. Add a defensive throw at the end:

```typescript
export function buildCreateTemplate(input: BuildTemplateInput): Event {
  // ... existing bottle/pump/extra branches ...

  if (input.type === "extra") {
    // ...
  }

  // CreatableType is exhaustive; this throw catches any stray caller
  // passing an unsupported type (e.g., a legacy "nap" callsite).
  throw new Error(`buildCreateTemplate: unsupported type ${String(input.type)}`);
}
```

Also delete the `projected?` parameter from `BuildTemplateInput` and the `nextFreeSlot` function's projection-scanning logic IF unused after the nap deletion. Audit `nextFreeSlot` callers — `bottle` still uses it. Keep it; just remove `projected` if no caller passes it.

Verify: `grep -n "buildCreateTemplate" src/` — confirm no caller passes `type: "nap"`.

- [ ] **Step 3: Run createEventTemplate tests**

Run: `pnpm vitest run src/v3/components/shared/createEventTemplate.test.ts`
Expected: PASS.

- [ ] **Step 4: Run typecheck to catch any caller passing `type: "nap"`**

Run: `pnpm typecheck`
Expected: clean, OR a list of files passing "nap" that need updating in Task 3.

- [ ] **Step 5: Commit**

```bash
git add src/v3/components/shared/createEventTemplate.ts src/v3/components/shared/createEventTemplate.test.ts
git commit -m "$(cat <<'EOF'
refactor(v3): drop nap from CreatableType — no FAB Add Nap

Per spec PR #146, the FAB drops the nap option entirely. Parents
adjust by editing existing projected nap chips, never by adding new
naps as a separate gesture.

Removes the nap branch from buildCreateTemplate and tightens the
CreatableType union to bottle|pump|extra. Defensive throw at function
end catches any stray caller; @ts-expect-error in the test documents
the type-narrow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Remove nap option from FABTypePicker

**Files:**
- Modify: `src/components/shared/FABTypePicker.tsx`
- Modify: `src/components/shared/FABTypePicker.test.tsx`

- [ ] **Step 1: Update the picker test**

In `FABTypePicker.test.tsx`, DELETE any test that asserts the nap option renders. Add (or modify an existing test) to assert the picker's option list does NOT contain "Nap":

```typescript
it("does not render a nap option", () => {
  render(<FABTypePicker open onClose={() => {}} onSelect={() => {}} />);
  expect(screen.queryByText("Nap")).not.toBeInTheDocument();
});
```

Note: `.toBeInTheDocument()` is banned per project convention — use `.toBeNull()` on `queryByText`:

```typescript
it("does not render a nap option", () => {
  render(<FABTypePicker open onClose={() => {}} onSelect={() => {}} />);
  expect(screen.queryByText("Nap")).toBeNull();
});
```

- [ ] **Step 2: Run the test — expect fail**

Run: `pnpm vitest run src/components/shared/FABTypePicker.test.tsx`
Expected: FAIL — "Nap" still renders.

- [ ] **Step 3: Remove the nap entry from the options array**

In `FABTypePicker.tsx`, DELETE this line (around line 17):

```typescript
{ type: "nap", label: "Nap", sub: "Unplanned sleep" },
```

- [ ] **Step 4: Run the test — expect pass**

Run: `pnpm vitest run src/components/shared/FABTypePicker.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/FABTypePicker.tsx src/components/shared/FABTypePicker.test.tsx
git commit -m "$(cat <<'EOF'
fix(v3): remove nap option from FABTypePicker

Per spec PR #146, parents don't add naps via FAB — they edit existing
projected nap chips. The picker now offers bottle, pump, extra only.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Cherry-pick z-index commit from closed PR #145

**Files:**
- Modify: `src/v3/components/Timeline/Block.module.css`

- [ ] **Step 1: Cherry-pick the z-index commit**

```bash
git cherry-pick 96e5531
```

If cherry-pick succeeds cleanly: skip to Step 4.

If cherry-pick conflicts (unlikely — Block.module.css hasn't changed on main since #145 closed):

- [ ] **Step 2: Manually apply z-index rules**

In `src/v3/components/Timeline/Block.module.css`, ADD this block after the `.block:focus-visible` rule (around line 44):

```css
/* === Z-index ordering ========================================
 * Order (back to front):
 *   wake_window (1) → nap, bedtime (2) → putdown (3) → extra (4) → pump (5)
 *
 * Pumps must render in front of sleep blocks because they're a parallel
 * parent-schedule activity sized to max-content. Extras above nap/bedtime
 * so user content never hides behind a cascade-projected block.
 */
.block[data-type="wake_window"] {
  z-index: 1;
}
.block[data-type="nap"],
.block[data-type="bedtime"] {
  z-index: 2;
}
.block[data-type="putdown"] {
  z-index: 3;
}
.block[data-type="extra"] {
  z-index: 4;
}
.block[data-type="pump"] {
  z-index: 5;
}
```

- [ ] **Step 3: Commit (if manually applied)**

```bash
git add src/v3/components/Timeline/Block.module.css
git commit -m "$(cat <<'EOF'
fix(v3): explicit z-index ordering for timeline Block variants

Cherry-picked from closed PR #145 (96e5531). Block.module.css's
header comment declared z-index intent ("z 2", "z 3") but no rules
were ever written. Pumps consequently rendered behind sleep blocks
because DOM order alone determined stacking.

Stacking order (back to front):
  wake_window (1) → nap, bedtime (2) → putdown (3) → extra (4) → pump (5)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Run tests for any timeline regressions**

Run: `pnpm vitest run src/v3/components/Timeline/`
Expected: all passing.

---

## Task 5: Dashboard CTA swap (§F8)

**Files:**
- Modify: `src/v3/components/Dashboard/NapActionButton.tsx`
- Modify: `src/v3/components/Dashboard/NapActionButton.test.tsx`

- [ ] **Step 1: Add failing tests for CTA swap**

In `NapActionButton.test.tsx`, add:

```typescript
describe("CTA swap past bedtime threshold", () => {
  it("renders 'Start Bedtime Now' when nowMinutes ≥ bedtimeThreshold and no inProgressNap", () => {
    const onStartBedtime = vi.fn();
    render(
      <NapActionButton
        inProgressNap={undefined}
        dayId="d-1"
        nextProjectedNap={undefined}
        nowMinutes={19 * 60 + 30}
        bedtimeThreshold={19 * 60}
        onStart={vi.fn()}
        onEnd={vi.fn()}
        onStartBedtime={onStartBedtime}
      />,
    );
    expect(screen.getByRole("button", { name: /start bedtime now/i })).toBeVisible();
  });

  it("calls onStartBedtime with a bedtime event when tapped past threshold", async () => {
    const onStartBedtime = vi.fn();
    render(
      <NapActionButton
        inProgressNap={undefined}
        dayId="d-1"
        nextProjectedNap={undefined}
        nowMinutes={19 * 60 + 30}
        bedtimeThreshold={19 * 60}
        onStart={vi.fn()}
        onEnd={vi.fn()}
        onStartBedtime={onStartBedtime}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /start bedtime now/i }));
    expect(onStartBedtime).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "bedtime",
        eventKey: "bedtime",
        startTime: 19 * 60 + 30,
        lifecycle: expect.objectContaining({ state: "started" }),
      }),
    );
  });

  it("renders 'Start Nap Now' when nowMinutes < bedtimeThreshold", () => {
    render(
      <NapActionButton
        inProgressNap={undefined}
        dayId="d-1"
        nextProjectedNap={{
          id: "proj_nap_1",
          dayId: "d-1",
          eventKey: "nap_1",
          type: "nap",
          kind: "block",
          startTime: 9 * 60,
          label: "Nap 1",
          hasPutdown: false,
          lifecycle: { state: "projected" },
        }}
        nowMinutes={10 * 60}
        bedtimeThreshold={19 * 60}
        onStart={vi.fn()}
        onEnd={vi.fn()}
        onStartBedtime={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /start nap now/i })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run tests — expect fail (props don't exist yet)**

Run: `pnpm vitest run src/v3/components/Dashboard/NapActionButton.test.tsx`
Expected: FAIL — `nowMinutes`, `bedtimeThreshold`, `onStartBedtime` props don't exist.

- [ ] **Step 3: Update `NapActionButton.tsx`**

ADD `nowMinutes`, `bedtimeThreshold`, `onStartBedtime` to the props type. REPLACE the `handleClick` function:

```typescript
export type NapActionButtonProps = {
  inProgressNap: Event | undefined;
  dayId: string;
  nextProjectedNap?: Event;
  nowMinutes: TimeMin;
  bedtimeThreshold: TimeMin;
  onStart: (nap: Event) => Promise<void>;
  onEnd: (nap: Event, endTime: TimeMin) => Promise<void>;
  onStartBedtime: (bedtime: Event) => Promise<void>;
};

export function NapActionButton({
  inProgressNap,
  dayId,
  nextProjectedNap,
  nowMinutes,
  bedtimeThreshold,
  onStart,
  onEnd,
  onStartBedtime,
}: NapActionButtonProps) {
  const handleClick = () => {
    const nowMin = currentLocalMinutes();
    if (inProgressNap) {
      void onEnd(inProgressNap, nowMin);
      return;
    }

    // Past threshold → start bedtime instead. The dashboard primary
    // CTA is always-actionable; physiology takes over from rhythm.
    if (nowMin >= bedtimeThreshold) {
      const bedtimeId = newEventId("bedtime");
      const bedtime: Event = {
        id: bedtimeId,
        dayId,
        eventKey: "bedtime",
        type: "bedtime",
        kind: "block",
        label: "Bedtime",
        startTime: nowMin,
        hasPutdown: false,
        lifecycle: { state: "started", committedAt: nowMin },
      };
      void onStartBedtime(bedtime);
      return;
    }

    // Standard path: promote nextProjectedNap. No UUID fallback —
    // under the physiology cascade, nextProjectedNap is always
    // defined within-day (cascade emits projections until threshold).
    if (!nextProjectedNap) return;
    const napId = newEventId("nap");
    const nap: Event = {
      id: napId,
      dayId,
      eventKey: nextProjectedNap.eventKey,
      type: "nap",
      kind: "block",
      label: nextProjectedNap.label,
      startTime: nowMin,
      hasPutdown: false,
      lifecycle: { state: "started", committedAt: nowMin },
    };
    void onStart(nap);
  };

  const label = inProgressNap
    ? "End Nap"
    : nowMinutes >= bedtimeThreshold
      ? "Start Bedtime Now"
      : "Start Nap Now";

  return (
    <ActionButton variant="secondary" onClick={handleClick}>
      {label}
    </ActionButton>
  );
}
```

Also remove the `nextNumber: number` and `maxSlot: number` props from the type — they were for the UUID fallback. Audit callers.

- [ ] **Step 4: Update callers in `src/app/(authed)/page.tsx`**

Find the `<NapActionButton>` usage. ADD `nowMinutes`, `bedtimeThreshold`, `onStartBedtime` props; REMOVE `nextNumber` and `maxSlot`.

The `onStartBedtime` handler routes through the same `createOptimistic` write-path as `onStart`:

```typescript
const handleStartBedtime = async (bedtime: Event) => {
  await createOptimistic(bedtime);
};
```

- [ ] **Step 5: Run NapActionButton tests + page tests**

Run: `pnpm vitest run src/v3/components/Dashboard/NapActionButton.test.tsx src/app/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/v3/components/Dashboard/NapActionButton.tsx src/v3/components/Dashboard/NapActionButton.test.tsx src/app/\(authed\)/page.tsx
git commit -m "$(cat <<'EOF'
feat(v3): dashboard CTA swaps to "Start Bedtime Now" past threshold

Per spec PR #146 + §F8. The primary dashboard CTA toggles based on
nowMinutes vs bedtimeThreshold:
  - Before threshold: "Start Nap Now" (promotes nextProjectedNap)
  - At/after threshold: "Start Bedtime Now" (creates a bedtime doc)

Removes the UUID fallback path on NapActionButton — under the
physiology cascade, nextProjectedNap is always defined within-day,
and past threshold the CTA is bedtime instead.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Drawer past-threshold prompt + nap→bedtime replacement

**Files:**
- Modify: `src/v3/components/shared/EventEditDrawerV3.tsx`
- Modify: existing drawer tests (find via grep)
- Possibly modify: `src/v3/components/shared/formToEvent.ts`

- [ ] **Step 1: Locate the drawer's save path and test file**

Run: `find src/v3/components/shared -name "EventEditDrawerV3*"` — confirm file paths.

Run: `grep -n "handleSave\|onSave\|threshold" src/v3/components/shared/EventEditDrawerV3.tsx` — locate the save function.

- [ ] **Step 2: Add failing tests for prompt behavior**

In the drawer's existing test file, add a describe block:

```typescript
describe("Past-threshold prompt when editing a nap", () => {
  // Per spec PR #146 R2: a nap whose startTime is moved from
  // < bedtimeThreshold to ≥ bedtimeThreshold prompts "Change to
  // bedtime?" before save. Yes → replace nap doc with bedtime doc.
  // No → save as nap; cascade emits projected bedtime after.

  it("does not prompt when nap startTime stays below threshold", async () => {
    const onSave = vi.fn();
    const onDelete = vi.fn();
    renderDrawer({
      event: napAt(9 * 60), // 9:00 AM
      bedtimeThreshold: 19 * 60,
      onSave,
      onDelete,
    });
    // Set form startTime to 10:00 AM, still below threshold.
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: "10:00" } });
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ type: "nap" }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("prompts when nap crosses to past-threshold; Yes → replace with bedtime doc", async () => {
    const onSave = vi.fn();
    const onDelete = vi.fn();
    renderDrawer({
      event: napAt(9 * 60),
      bedtimeThreshold: 19 * 60,
      onSave,
      onDelete,
    });
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: "20:00" } });
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    // Prompt appears.
    expect(screen.getByText(/change to bedtime\?/i)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /yes/i }));
    // Original nap doc deleted; bedtime doc created.
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ type: "nap" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "bedtime",
        eventKey: "bedtime",
        startTime: 20 * 60,
      }),
    );
  });

  it("prompts on cross; No → save as nap, no delete", async () => {
    const onSave = vi.fn();
    const onDelete = vi.fn();
    renderDrawer({
      event: napAt(9 * 60),
      bedtimeThreshold: 19 * 60,
      onSave,
      onDelete,
    });
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: "20:00" } });
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await userEvent.click(screen.getByRole("button", { name: /no, keep as nap/i }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ type: "nap", startTime: 20 * 60 }),
    );
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("does not prompt when nap was already past threshold and owner-only change", async () => {
    const onSave = vi.fn();
    const onDelete = vi.fn();
    renderDrawer({
      event: napAt(20 * 60), // already past threshold
      bedtimeThreshold: 19 * 60,
      onSave,
      onDelete,
    });
    // No time change; just save.
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.queryByText(/change to bedtime\?/i)).toBeNull();
    expect(onSave).toHaveBeenCalled();
  });
});

function napAt(start: number): Event {
  return {
    id: "n-1",
    dayId: "d-1",
    eventKey: "nap_2",
    type: "nap",
    kind: "block",
    startTime: start,
    label: "Nap 2",
    hasPutdown: false,
    lifecycle: { state: "projected" },
  };
}

function renderDrawer(props: {
  event: Event;
  bedtimeThreshold: TimeMin;
  onSave: (e: Event) => void;
  onDelete: (e: Event) => void;
}) {
  // ... mirror the existing test setup in the drawer test file ...
}
```

The exact `renderDrawer` helper depends on existing test patterns in the file — copy them.

- [ ] **Step 3: Run tests — expect fail**

Run: `pnpm vitest run src/v3/components/shared/EventEditDrawerV3` (or wherever the drawer tests live)
Expected: FAIL — no prompt UI exists yet.

- [ ] **Step 4: Implement the prompt in `handleSave`**

In `EventEditDrawerV3.tsx`, add state for the pending save + prompt visibility:

```typescript
const [pendingPastThresholdSave, setPendingPastThresholdSave] = useState<Event | null>(null);

const handleSave = () => {
  if (!form) return;
  const formForTransform = /* ... existing logic ... */;
  const next = formToEvent(formForTransform, sourceEvent, nowMinutes);

  // Prompt condition: nap whose startTime crossed from < threshold
  // to ≥ threshold within this edit.
  const isNapEdit = next.type === "nap";
  const originalStart = sourceEvent.startTime;
  const newStart = next.startTime;
  const crossed = originalStart < bedtimeThreshold && newStart >= bedtimeThreshold;

  if (isNapEdit && crossed) {
    setPendingPastThresholdSave(next);
    return;
  }

  void onSave(next);
};

const handleConfirmChangeToBedtime = () => {
  if (!pendingPastThresholdSave) return;
  // Carry forward owner, label-related fields. Replace doc:
  //   1. Delete the original nap (via onDelete)
  //   2. Save a new bedtime event at the same startTime
  const napCandidate = pendingPastThresholdSave;
  const bedtimeId = newEventId("bedtime");
  const bedtime: Event = {
    id: bedtimeId,
    dayId: napCandidate.dayId,
    eventKey: "bedtime",
    type: "bedtime",
    kind: "block",
    label: "Bedtime",
    startTime: napCandidate.startTime,
    endTime: napCandidate.endTime,
    hasPutdown: false,
    lifecycle: napCandidate.lifecycle,
    ...(napCandidate.owner ? { owner: napCandidate.owner } : {}),
  };
  if (onDelete) void onDelete(sourceEvent);
  void onSave(bedtime);
  setPendingPastThresholdSave(null);
};

const handleKeepAsNap = () => {
  if (!pendingPastThresholdSave) return;
  void onSave(pendingPastThresholdSave);
  setPendingPastThresholdSave(null);
};
```

Render the prompt as a modal block within the drawer JSX when `pendingPastThresholdSave !== null`:

```tsx
{pendingPastThresholdSave && (
  <div className={styles.confirmPrompt} role="dialog">
    <p>This nap starts after your bedtime threshold. Change to bedtime?</p>
    <button type="button" onClick={handleConfirmChangeToBedtime}>Yes, change to bedtime</button>
    <button type="button" onClick={handleKeepAsNap}>No, keep as nap</button>
  </div>
)}
```

Add the `bedtimeThreshold` prop to the drawer's prop type; thread it through callers (page.tsx, tomorrow/page.tsx, timeline/page.tsx — they have access via `settings`).

Add a `.confirmPrompt` CSS class to the drawer's stylesheet.

- [ ] **Step 5: Run drawer tests — expect pass**

Run: `pnpm vitest run src/v3/components/shared/EventEditDrawerV3`
Expected: PASS.

- [ ] **Step 6: Run typecheck + full test suite for regressions**

Run: `pnpm typecheck && pnpm test`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/v3/components/shared/EventEditDrawerV3.tsx src/v3/components/shared/EventEditDrawerV3.module.css src/v3/components/shared/EventEditDrawerV3.test.tsx src/app/
git commit -m "$(cat <<'EOF'
feat(v3): past-threshold prompt on nap drawer-edit

Per spec PR #146 R2: a nap whose startTime moves from below to at/
after bedtimeThreshold fires a "Change to bedtime?" prompt at Save.
Yes deletes the nap doc and creates a bedtime doc carrying owner/
notes forward. No saves the nap; the cascade emits a projected
bedtime after (per the physiology cascade in naps.ts).

Owner-only edits on already-past-threshold naps do NOT re-prompt —
the trigger is the threshold-crossing gesture, not the saved state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Doc updates

**Files:**
- Modify: `DOMAIN.md`
- Modify: `docs/v3/ENGINE_SPEC.md`
- Modify: `docs/v3/FAST_FOLLOW.md`

- [ ] **Step 1: Update `DOMAIN.md` §1**

Add a paragraph after the existing §1 content explaining the cadence-sequence model:

```markdown
**Wake-window cadence is a sequence, not a slot count.** The
configured `wakeWindowsMinutes` array describes the natural
cadence — when entries run out, the cadence simply continues with
the last configured value. Physiology, not configuration, ends the
day: when the cascade's next projected nap would cross the bedtime
threshold, the next sleep IS bedtime.
```

- [ ] **Step 2: Update `DOMAIN.md` §3**

Add to §3:

```markdown
**Overnight wake-ups are normal interruptions.** A baby waking
during the bedtime block (e.g., crying for a bottle at 2 AM, then
going back to sleep) is part of normal bedtime — it does not
create a separate nap event. The bedtime block extends continuously
until the next morning's wake.
```

- [ ] **Step 3: Update `docs/v3/ENGINE_SPEC.md`**

Find R3.1 description (cascade rules). REPLACE references to "slot count" or "wakeWindowsMinutes.length as cap" with the cadence-sequence model. Add note about the cascade walking until bedtime threshold using `wws[min(rhythmN-1, wws.length-1)]`.

DELETE the R7.4b rule (no nap_5 emitted) — it's no longer true.

- [ ] **Step 4: Update `docs/v3/FAST_FOLLOW.md` to close §F8**

Move §F8 to `docs/v3/FAST_FOLLOW_COMPLETED.md` (or equivalent companion file per project doc-hygiene rule). Compress entry to a one-liner referencing the PR that delivered it.

- [ ] **Step 5: Commit**

```bash
git add DOMAIN.md docs/v3/ENGINE_SPEC.md docs/v3/FAST_FOLLOW.md docs/v3/FAST_FOLLOW_COMPLETED.md
git commit -m "$(cat <<'EOF'
docs(v3): update DOMAIN + ENGINE_SPEC for physiology cascade

DOMAIN.md §1: clarify wakeWindowsMinutes is a cadence sequence, not
a slot count.
DOMAIN.md §3: explicit note that overnight wake-ups are normal
interruptions inside bedtime.
ENGINE_SPEC.md: replace R3.1 cap-based cascade description; drop
R7.4b (no nap_5 — cap doesn't exist anymore).
FAST_FOLLOW.md: close §F8 (delivered in this campaign).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Final sweep + push + PR

- [ ] **Step 1: Full pre-push verification**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`
Expected: all green.

Run integration tests if a Firestore emulator is available:
`FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm vitest run src/repositories src/v3/repositories tests/integration`
Expected: all green.

If prettier flags formatting: `pnpm prettier --write <files>` then re-run.

- [ ] **Step 2: Wipe local emulator** (to clean PR #143 click-test contamination)

```bash
rm -rf .firebase/emulator-data 2>/dev/null || true
```

- [ ] **Step 3: Manual click-test**

Start dev server, then in the browser:

1. **Cascade extends past array** — settings `wakeWindowsMinutes=[120, 90]`, threshold 19:00. Verify dashboard/timeline shows nap_1..nap_4 (or more) until bedtime, not just nap_1, nap_2.
2. **No nap option in FAB** — tap FAB. Confirm picker shows Bottle / Pump / Custom only.
3. **Drawer prompt** — tap projected nap_2 chip, drawer opens. Change startTime to past 19:00 threshold. Save. Confirm prompt appears. Choose Yes → nap chip becomes bedtime chip. Reopen, drag back to before threshold, save → nap chip restored. Now choose No on the prompt → nap stays at the late time, cascade emits projected bedtime after.
4. **Dashboard CTA swap** — wait until `nowMinutes ≥ bedtimeThreshold` (or set threshold to current time). Confirm primary CTA reads "Start Bedtime Now." Tap → creates a bedtime event.
5. **Pumps render on top** — pump overlapping a sleep block renders in front.

- [ ] **Step 4: Push branch**

```bash
git push -u origin feat/v3-physiology-cascade
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create --title "feat(v3): physiology cascade — naps fill day to bedtime; no FAB Add Nap" --body "$(cat <<'EOF'
## Summary

Implements the physiology cascade per spec PR #146:

1. **Naps cascade until bedtime threshold** using cadence-extension (`wws[min(rhythmN-1, wws.length-1)]` for WW length).
2. **FAB drops nap option** — parents adjust by editing existing projected nap chips.
3. **Drawer prompt on past-threshold nap edit** — "Change to bedtime?" Yes deletes nap doc + creates bedtime doc; No keeps nap + cascade emits projected bedtime after.
4. **Dashboard CTA swaps to "Start Bedtime Now"** when `nowMinutes ≥ bedtimeThreshold` (§F8 delivered).
5. **Block z-index ordering** cherry-picked from closed PR #145 (fixes pump-behind-sleep).
6. **Docs updated** — DOMAIN.md §1 (cadence-sequence), §3 (overnight interruptions); ENGINE_SPEC.md R3.1 + drop R7.4b.

Replaces the closed PR #145 (chronological cascade) — the model has collapsed, no hybrid matchers or post-threshold coercion needed.

## Tests

- Unit: all engine + render + hook tests passing, including new cascade-extends-past-array scenarios + drawer-prompt scenarios.
- Integration: emulator-backed repository tests passing.
- Cascade invariant (`wake_window(N).startTime === nap(N-1).endTime`) holds across all scenarios.

## Click-test steps

(see PR body — same five scenarios as in plan Task 8 Step 3)

## Contaminated data

None for production. Local emulator state was contaminated from PR #143 click-tests; wipe before verifying.

## Checklist
- [x] Tests passing
- [x] Pre-push hook green
- [x] Click-test steps documented and verified

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Notes

**Spec coverage:**
- R1 (cascade extends until threshold): Task 1 ✓
- R2 (past-threshold prompt + nap→bedtime replace): Task 6 ✓
- R3 (no FAB Add Nap): Tasks 2, 3 ✓
- R4 (dashboard CTA swap): Task 5 ✓
- R5 (templates same model): no work needed — templates are already sparse arrays; cascade-extension handles missing entries naturally
- R6 (z-index): Task 4 ✓
- Doc updates: Task 7 ✓

**Risk callouts:**
- Task 1's HARD_CAP=48 defensive cap is engine-internal; if a user configures bedtimeThreshold = 47h (data anomaly), the cascade still terminates. Replace with a real validation at the settings boundary if it ever becomes an issue.
- Task 6's nap→bedtime replace is two writes (delete + create). If they're not atomic, a brief intermediate state shows the timeline with the nap removed but no bedtime yet. Acceptable for a single-user dev session; revisit if real users see flicker.
- Task 5's removal of `nextNumber`/`maxSlot` props from `NapActionButton` breaks the public API; audit callers (only page.tsx today) and update in lockstep.
