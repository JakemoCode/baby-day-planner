# §F66 — Cascade + state-model rewrite implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the model collapse decided in §F66 grill: Now-cross auto-promote replaces dashboard action buttons (ADR-0001), and `bedtimeThreshold` flips semantic with a new `earliestBedtime` floor (ADR-0002). Plus putdown bottle-anchor, future-event drawer rule, dream feed setting.

**Architecture:** Seven sequential PRs off fresh `origin/main`. Each PR independently mergeable, tests-green at every checkpoint. PR4 is the largest (auto-promote + dashboard-button removal must ship together). PR2 / PR3 / PR5 / PR6 / PR7 are smaller, focused changes.

**Tech Stack:** TypeScript, React, Next.js, Firestore (emulator for integration tests), Vitest, React Testing Library, Playwright (existing E2E).

**Out of scope (separate paths):** #5 (2h14m formatter), #6e (disappearing bottle write-path bug), #6g (cascade ceiling triage), #7 (validation flash). Each gets its own small PR.

**Updated 2026-05-26** with ADR-0003 (dashboard contextual button is multi-modal — adds Log Bottle Time mode) and ADR-0004 (no-past-projections invariant). Affects PR 3 (putdown-anchor precedence) and PR 4 (button mode logic).

---

## PR sequence

| PR | Title | Branch | Depends on |
|---|---|---|---|
| 1 | Settings: add `earliestBedtime`, change `bedtimeThreshold` default | `feat/f66-earliest-bedtime-setting` | — |
| 2 | Engine: new bedtime cascade rule (drop nap past threshold; floor) | `feat/f66-bedtime-cascade-rule` | PR1 |
| 3 | Engine: putdown bottle-anchor rule | `feat/f66-putdown-bottle-anchor` | — (parallel) |
| 4 | Now-cross auto-promote + multi-modal dashboard button (End Nap / Log Bottle Time) | `feat/f66-now-cross-promote-buttons` | PR2 |
| 5 | Drawer: future-event = owner-only edit | `feat/f66-drawer-future-owner-only` | PR4 |
| 6 | Settings: `dreamFeedTime` + special bottle anchor | `feat/f66-dream-feed-setting` | PR1 |
| 7 | Docs: DATA_MODEL / ENGINE_SPEC / DOMAIN updates + close fast-follows | `docs/f66-cascade-doc-sweep` | PR1-6 |

---

## PR 1 — Settings: add `earliestBedtime`, change `bedtimeThreshold` default

**Files:**
- Modify: `src/v3/schemas.ts:302-349` (Settings type)
- Modify: `src/v3/firestore/settingsDefaults.ts:29-75` (defaults)
- Modify: `src/app/(signed-in-with-child)/settings/page.tsx:86-99` (UI)
- Test: `src/v3/firestore/settingsDefaults.test.ts` (new or existing)

### Task 1.1: Settings type + defaults

- [ ] **Step 1: Write a failing test for the new defaults**

```ts
// src/v3/firestore/settingsDefaults.test.ts
import { describe, it, expect } from "vitest";
import { DEFAULTS } from "./settingsDefaults";
import { minutesFromHHMM } from "../time";

describe("settingsDefaults — F66", () => {
  it("bedtimeThreshold default is 17:30 (latest projected nap end)", () => {
    expect(DEFAULTS.bedtimeThreshold).toBe(minutesFromHHMM("17:30"));
  });

  it("earliestBedtime default is 18:00 (floor for projected bedtime)", () => {
    expect(DEFAULTS.earliestBedtime).toBe(minutesFromHHMM("18:00"));
  });

  it("earliestBedtime > bedtimeThreshold (floor strictly after the cap)", () => {
    expect(DEFAULTS.earliestBedtime).toBeGreaterThan(DEFAULTS.bedtimeThreshold);
  });
});
```

- [ ] **Step 2: Run test to verify FAIL** — `pnpm test settingsDefaults` → fails (no `earliestBedtime`).

- [ ] **Step 3: Add `earliestBedtime: TimeMin` to `Settings` type at `schemas.ts:311` (alongside `bedtimeThreshold`).**

```ts
// src/v3/schemas.ts (in Settings type, after bedtimeThreshold)
earliestBedtime: TimeMin;
```

- [ ] **Step 4: Update `DEFAULTS` in `settingsDefaults.ts`:**

```ts
// Keep bedtimeThreshold field name; change default value (was 19:00).
bedtimeThreshold: minutesFromHHMM("17:30"),
earliestBedtime: minutesFromHHMM("18:00"),
```

- [ ] **Step 5: Run test to verify PASS** — `pnpm test settingsDefaults` → green.

- [ ] **Step 6: Update Firestore converter to default-fill `earliestBedtime`** on legacy docs. Open `src/v3/firestore/converters/settings.ts` (or equivalent) and ensure `fromFirestore` coerces missing `earliestBedtime` to `DEFAULTS.earliestBedtime`. Run all settings tests.

- [ ] **Step 7: Commit**

```bash
git add src/v3/schemas.ts src/v3/firestore/settingsDefaults.ts src/v3/firestore/converters/settings.ts src/v3/firestore/settingsDefaults.test.ts
git commit -m "feat(settings): add earliestBedtime + change bedtimeThreshold default to 17:30 (ADR-0002)"
```

### Task 1.2: Settings UI

- [ ] **Step 1: Read `src/app/(signed-in-with-child)/settings/page.tsx` around the `bedtimeThreshold` TimeRow to understand the existing pattern.**

- [ ] **Step 2: Add the `earliestBedtime` TimeRow next to `bedtimeThreshold`. Match exact existing pattern.**

```tsx
// src/app/(signed-in-with-child)/settings/page.tsx — after bedtimeThreshold TimeRow
<TimeRow
  label="Earliest bedtime"
  value={settings.earliestBedtime}
  onChange={(v) => updateSetting("earliestBedtime", v)}
  helperText="Floor for projected bedtime — engine never projects bedtime before this."
/>
```

Also: update the `bedtimeThreshold` row's `label` to "Latest nap end (bedtime threshold)" and update its helperText to "If a projected nap would end past this, drop it — bedtime takes over at earliestBedtime."

- [ ] **Step 3: Manually open the settings page in dev (PORT=3001 pnpm dev with `.env.local` copied from repo root) and confirm both fields render. Save a change and reload to confirm persistence.**

- [ ] **Step 4: Commit**

```bash
git add src/app/(signed-in-with-child)/settings/page.tsx
git commit -m "feat(settings-ui): expose earliestBedtime, relabel bedtimeThreshold"
```

### Task 1.3: Open PR

- [ ] Push branch, open PR titled `feat(settings): F66 PR 1 — earliestBedtime + bedtimeThreshold semantic shift`. PR body includes: ADR-0002 reference, screenshot of settings UI, and these click-test steps:
  1. Open /settings, scroll to bedtime section
  2. Confirm two adjacent time rows: "Latest nap end (bedtime threshold)" defaulting 5:30pm, "Earliest bedtime" defaulting 6:00pm
  3. Change earliestBedtime to 6:30pm, navigate away, return, confirm persistence

---

## PR 2 — Engine: new bedtime cascade rule

**Files:**
- Modify: `src/v3/engine/rules/naps.ts:54, 115-150`
- Modify: `src/v3/engine/rules/naps.test.ts` (existing tests)
- Test: same file (add new cases)

### Task 2.1: Failing tests for new rule

- [ ] **Step 1: Add three new test cases in `src/v3/engine/rules/naps.test.ts`. Use the existing `runRules` / `ALL_RULES` harness.**

```ts
// src/v3/engine/rules/naps.test.ts (append to existing describe block)
describe("F66 bedtime cascade — ADR-0002", () => {
  it("drops a projected nap whose endTime crosses bedtimeThreshold", () => {
    const ctx = buildCtx({
      bedtimeThreshold: hm("17:30"),
      earliestBedtime: hm("18:00"),
      wakeWindowMinutes: 120,
      napLengthMinutes: 45,
    });
    const seedNap = recordedNap({ startTime: hm("14:00"), endTime: hm("14:45") });
    // WW from 14:45-16:45, projected nap would be 16:45-17:30 (endTime == threshold, allowed)
    // Then WW 17:30-19:30, projected nap 19:30+ — dropped.
    const out = projectDay(ctx, [seedNap]);
    const projectedNaps = out.filter((e) => e.type === "nap" && isProjected(e));
    // No projected nap should have endTime > 17:30
    projectedNaps.forEach((n) => {
      expect(n.endTime ?? n.startTime + 45).toBeLessThanOrEqual(hm("17:30"));
    });
  });

  it("projects bedtime at max(earliestBedtime, lastNapEnd + WW)", () => {
    const ctx = buildCtx({
      bedtimeThreshold: hm("17:30"),
      earliestBedtime: hm("18:00"),
      wakeWindowMinutes: 120,
      napLengthMinutes: 45,
    });
    // Last nap ends at 15:00, +120 WW = 17:00. Floor 18:00 should apply.
    const lastNap = recordedNap({ startTime: hm("14:15"), endTime: hm("15:00") });
    const out = projectDay(ctx, [lastNap]);
    const bedtime = out.find((e) => e.type === "bedtime");
    expect(bedtime?.startTime).toBe(hm("18:00"));
  });

  it("§F64 regression: nap projecting 16:46-17:31 is dropped (not converted to 16:46 bedtime)", () => {
    const ctx = buildCtx({
      bedtimeThreshold: hm("17:30"),
      earliestBedtime: hm("18:00"),
      wakeWindowMinutes: 120,
      napLengthMinutes: 45,
    });
    // Cascade math: nap ending at 17:31 fails threshold check (17:31 > 17:30) → drop.
    const seedNap = recordedNap({ startTime: hm("13:14"), endTime: hm("13:59") });
    // Next WW 13:59-15:59, nap 15:59-16:44, WW 16:44-18:44 ... nap projecting 16:44-17:29 keeps; next nap dropped.
    const out = projectDay(ctx, [seedNap]);
    const bedtime = out.find((e) => e.type === "bedtime");
    expect(bedtime).toBeDefined();
    // Bedtime startTime must be ≥ earliestBedtime; NEVER < 17:00 (the buggy 4:46pm case).
    expect(bedtime!.startTime).toBeGreaterThanOrEqual(hm("18:00"));
  });
});
```

- [ ] **Step 2: Run tests to verify FAIL** — `pnpm test naps` → all three fail.

### Task 2.2: Rewrite the cascade rule

- [ ] **Step 1: Replace `naps.ts:121-126` block. Read the file first to get the surrounding context.**

```ts
// src/v3/engine/rules/naps.ts:54 — add reference
const threshold = ctx.settings.bedtimeThreshold;
const earliestBedtime = ctx.settings.earliestBedtime;
```

```ts
// src/v3/engine/rules/naps.ts:121-126 — replace the wouldCrossThreshold block
// ADR-0002: a projected nap whose endTime > bedtimeThreshold is dropped.
// Bedtime then projects at max(earliestBedtime, lastNapEnd + WW).
const projectedNapEnd = napStart + napLen;
const exceedsThreshold = projectedNapEnd > threshold;
if (!manualBedtime && !existingNap && exceedsThreshold) {
  projected.push(buildWakeWindow(ctx, n, wwStart, Math.max(earliestBedtime, wwStart)));
  const bedtimeStart = Math.max(earliestBedtime, wwStart);
  projected.push(buildProjectedBedtime(ctx, bedtimeStart, ctx.settings));
  break;
}
```

- [ ] **Step 2: Run the F66 tests** — `pnpm test naps -t F66` → all three pass.

- [ ] **Step 3: Run the full naps suite** — `pnpm test naps` → may reveal stale expectations from the old rule. Fix each that asserts the old "nap-at-threshold becomes bedtime at napStart" behavior; rewrite to assert the new "drop + floor" behavior.

- [ ] **Step 4: Run the engine cascade invariant test** (the wake-window N start = nap N-1 end test mentioned in AGENTS.md). Confirm it still passes.

- [ ] **Step 5: Run `pnpm test` (full unit suite). Fix any other tests that asserted the old rule.**

- [ ] **Step 6: Commit**

```bash
git add src/v3/engine/rules/naps.ts src/v3/engine/rules/naps.test.ts
git commit -m "feat(engine): F66 bedtime cascade — drop nap past threshold, floor at earliestBedtime (ADR-0002)"
```

### Task 2.3: Open PR

- [ ] Push, open PR titled `feat(engine): F66 PR 2 — bedtime cascade rule (ADR-0002)`. PR body includes ADR-0002 link, §F64 closure note, and these click-test steps:
  1. Open /timeline. With settings bedtimeThreshold=5:30, earliestBedtime=6:00, default WW + nap lengths
  2. Record a nap ending at 1:00pm. Confirm projected bedtime ≥ 6:00pm
  3. Record a nap ending at 4:00pm. Confirm projected bedtime = 6:00pm exactly (floor applies)
  4. Confirm NO nap is projected ending past 5:30pm

---

## PR 3 — Engine: putdown bottle-anchor + no-past-projections invariant (parallel with PR 2)

**ADR refs:** CONTEXT.md "putdown bottle-anchor rule" + ADR-0004 "no-past-projections invariant."

**Precedence:** the past-projections invariant trumps putdown-anchor. If the putdown-snap target time `parent.startTime - putdownLeadMinutes` is `≤ Now`, skip the snap and fall through to the next-valid-future-slot calculation.

Add at least one test case for the precedence: a recorded nap whose start was edited later (e.g., 12:20 instead of 12:00) producing a cascade bottle whose snap-target is past Now — must end up at `nap.endTime`, not `nap.startTime - 15min`.



**Files:**
- Modify: `src/v3/engine/rules/bottles.ts` (cascade-time computation)
- Test: `src/v3/engine/rules/bottles.test.ts`

### Task 3.1: Failing test

- [ ] **Step 1: Add test case for putdown-anchor in `bottles.test.ts`.**

```ts
// src/v3/engine/rules/bottles.test.ts
describe("F66 putdown bottle-anchor — CONTEXT.md 'putdown bottle-anchor rule'", () => {
  it("snaps bottle to putdown.startTime when projected time falls in [parent.startTime - putdownLeadMinutes, parent.startTime + napLen/2]", () => {
    const ctx = buildCtx({
      putdownLeadMinutes: 15,
      defaultBottleIntervalMinutes: 180,
      napLengthMinutes: 45,
    });
    // Projected nap at 13:00-13:45. Putdown window [12:45, 13:00].
    // Cascade-computed bottle at 13:05 (within "first half of nap" = 13:00 to 13:22)
    // → snaps to 12:45 (putdown start).
    const seedBottle = recordedBottle({ startTime: hm("10:05"), amountOz: 5 });
    const seedNap = projectedNap({ startTime: hm("13:00"), endTime: hm("13:45") });
    const out = projectDay(ctx, [seedBottle, seedNap]);
    const cascadeBottle = out.find(
      (e) => e.type === "bottle" && e.startTime > hm("12:00") && e.startTime < hm("14:00")
    );
    expect(cascadeBottle?.startTime).toBe(hm("12:45"));
  });

  it("leaves mid-wake-window bottles outside the putdown range alone", () => {
    const ctx = buildCtx({ putdownLeadMinutes: 15, defaultBottleIntervalMinutes: 180 });
    const seedBottle = recordedBottle({ startTime: hm("08:00"), amountOz: 5 });
    const seedNap = projectedNap({ startTime: hm("14:00"), endTime: hm("14:45") });
    // Cascade projects 11:00 bottle (180 min interval, no putdown nearby).
    const out = projectDay(ctx, [seedBottle, seedNap]);
    const cascade = out.find(
      (e) => e.type === "bottle" && e.startTime > hm("10:00") && e.startTime < hm("12:00")
    );
    expect(cascade?.startTime).toBe(hm("11:00"));
  });
});
```

- [ ] **Step 2: Run test to verify FAIL** — `pnpm test bottles -t putdown` → fails.

### Task 3.2: Implementation

- [ ] **Step 1: Add a helper near `projectBottleChain` in `src/v3/engine/rules/bottles.ts`:**

```ts
// src/v3/engine/rules/bottles.ts (helper above projectBottleChain)
function snapToPutdown(
  proposedTime: number,
  events: Event[],
  putdownLeadMinutes: number,
  napLengthMinutes: number,
): number {
  // Find a projected nap/bedtime whose putdown range contains proposedTime.
  // Range: [parent.startTime - putdownLeadMinutes, parent.startTime + napLen/2].
  // Note: for bedtime, "first half" doesn't apply identically — use the
  // putdownLead window only (parent.startTime - lead, parent.startTime).
  for (const ev of events) {
    if (ev.type !== "nap" && ev.type !== "bedtime") continue;
    if (!isProjected(ev)) continue;
    const lead = putdownLeadMinutes;
    const half = ev.type === "nap" ? Math.floor(napLengthMinutes / 2) : 0;
    const lo = ev.startTime - lead;
    const hi = ev.startTime + half;
    if (proposedTime >= lo && proposedTime <= hi) {
      return ev.startTime - lead;
    }
  }
  return proposedTime;
}
```

- [ ] **Step 2: Wire `snapToPutdown` into the cascade time-emit calls. Find every place in `projectBottleChain` where a new bottle's `startTime` is computed (cold-start seed and forward-cascade step) and wrap them:**

```ts
// Replace bare `nextTime` assignment with:
const nextTime = snapToPutdown(
  proposedTime,
  events,
  ctx.settings.putdownLeadMinutes,
  ctx.settings.napLengthMinutes,
);
```

- [ ] **Step 3: Run test to verify PASS** — `pnpm test bottles -t putdown` → green.

- [ ] **Step 4: Run full bottles suite. Fix any existing tests whose bottle times shift by ±15min because of the new snap (these are legitimate behavior changes — update assertions to match the new times).**

- [ ] **Step 5: Run full unit suite** — `pnpm test` → green.

- [ ] **Step 6: Commit**

```bash
git add src/v3/engine/rules/bottles.ts src/v3/engine/rules/bottles.test.ts
git commit -m "feat(engine): F66 putdown bottle-anchor rule (issue #6f)"
```

### Task 3.3: Open PR

- [ ] Push, open PR. Click-test steps:
  1. Open /timeline, configure settings: putdownLeadMinutes=15, default bottle interval=180min
  2. Record a bottle at 10:00am
  3. Confirm next cascade bottle projects at 1:00pm (not snapped — no nap nearby)
  4. Record a nap projecting at 1:30pm (force via wake-window settings or skip if naps complicate)
  5. Now the cascade bottle should project at 1:15pm (snapped to putdown start)

---

## PR 4 — Now-cross auto-promote + multi-modal dashboard button (LARGE)

**ADR refs:** ADR-0001 (Now-cross + button removal) extended by ADR-0003 (dashboard contextual button is multi-modal).

**Scope expansion vs original plan:** the surviving dashboard button is no longer "End Nap Now only" — it's a single contextual slot with two modes (End Nap / Log Bottle Time) and a hidden default. See CONTEXT.md "dashboard contextual button" for the mode-selection table and overlap rules. Add a new component (e.g. `DashboardContextualButton.tsx`) that owns the mode-selection logic, plus integration tests covering:

1. In-progress nap → End Nap → sets endTime = Now.
2. In ±15min of projected bottle (no nap) → Log Bottle Time → writes recorded bottle {startTime: Now, amount: default}.
3. Overlap (in-progress nap straddles bottle window) → End Nap wins until nap auto-completes, then Log Bottle appears if still in window.
4. Putdown bottle (bottle anchored to putdown.startTime) within ±15min → Log Bottle is active mode (nap hasn't started yet).
5. Neither condition → button is hidden (not just disabled).



**Files:**
- Create: `src/v3/lifecycle/applyNowCrossPromotion.ts`
- Modify: `src/v3/renderProjection.ts` (or equivalent — where engine output is finalized for the UI)
- Delete: `src/v3/components/Dashboard/NapActionButton.tsx` (mostly)
- Delete: `src/v3/components/Dashboard/StartBottleButton.tsx`
- Modify: `src/v3/components/Dashboard/Dashboard.tsx` (CTA decision; keep only End-Nap-Now during in-progress)
- Test: integration test using real engine + real renderProjection

### Task 4.1: Auto-promote helper — TDD

- [ ] **Step 1: Write a failing unit test for the helper.**

```ts
// src/v3/lifecycle/applyNowCrossPromotion.test.ts
import { describe, it, expect } from "vitest";
import { applyNowCrossPromotion } from "./applyNowCrossPromotion";

describe("applyNowCrossPromotion — ADR-0001", () => {
  it("promotes a projected bottle whose startTime < now", () => {
    const now = 12 * 60;
    const projected = {
      id: "p1",
      type: "bottle",
      startTime: 11 * 60,
      amountOz: 5,
      lifecycle: { state: "projected" } as const,
    };
    const out = applyNowCrossPromotion([projected], now);
    expect(out[0]?.lifecycle.state).toBe("recorded");
  });

  it("leaves projected events whose startTime >= now alone", () => {
    const now = 12 * 60;
    const projected = {
      id: "p1",
      type: "bottle",
      startTime: 13 * 60,
      amountOz: 5,
      lifecycle: { state: "projected" } as const,
    };
    const out = applyNowCrossPromotion([projected], now);
    expect(out[0]?.lifecycle.state).toBe("projected");
  });

  it("for interval events (nap): start promotes at Now-cross of startTime; end promotes only at Now-cross of endTime", () => {
    const now = 13 * 60 + 30;
    const projectedNap = {
      id: "n1",
      type: "nap",
      startTime: 13 * 60,
      endTime: 14 * 60,
      lifecycle: { state: "projected" } as const,
    };
    const out = applyNowCrossPromotion([projectedNap], now);
    // Now is between start (13:00) and end (14:00). Start has promoted; end has not.
    // Lifecycle state is "recorded" (in-progress); endTime remains projected value.
    expect(out[0]?.lifecycle.state).toBe("recorded");
    expect(out[0]?.endTime).toBe(14 * 60);
  });

  it("for interval events (nap): both start and end promoted when now >= endTime", () => {
    const now = 14 * 60 + 30;
    const projectedNap = {
      id: "n1",
      type: "nap",
      startTime: 13 * 60,
      endTime: 14 * 60,
      lifecycle: { state: "projected" } as const,
    };
    const out = applyNowCrossPromotion([projectedNap], now);
    expect(out[0]?.lifecycle.state).toBe("completed");
  });

  it("does not promote already-recorded events", () => {
    const now = 12 * 60;
    const recorded = {
      id: "r1",
      type: "bottle",
      startTime: 11 * 60,
      amountOz: 5,
      lifecycle: { state: "recorded", annotatedAt: 11 * 60 } as const,
    };
    const out = applyNowCrossPromotion([recorded], now);
    expect(out[0]?.lifecycle.state).toBe("recorded");
  });
});
```

- [ ] **Step 2: Run test to verify FAIL** — `pnpm test applyNowCrossPromotion` → fails (module not found).

- [ ] **Step 3: Implement the helper.**

```ts
// src/v3/lifecycle/applyNowCrossPromotion.ts
import type { Event } from "../schemas";

export function applyNowCrossPromotion(events: Event[], now: number): Event[] {
  return events.map((e) => {
    if (e.lifecycle.state !== "projected") return e;
    const isInstant = e.type === "bottle" || e.type === "extra";
    if (isInstant) {
      return e.startTime < now
        ? { ...e, lifecycle: { state: "recorded", annotatedAt: e.startTime } }
        : e;
    }
    // Interval (nap, bedtime, putdown-as-event if any)
    const end = e.endTime ?? e.startTime;
    if (now >= end) {
      return { ...e, lifecycle: { state: "completed", committedAt: end } };
    }
    if (now >= e.startTime) {
      return { ...e, lifecycle: { state: "recorded", annotatedAt: e.startTime } };
    }
    return e;
  });
}
```

- [ ] **Step 4: Run test to verify PASS** — `pnpm test applyNowCrossPromotion` → green (all 5 cases).

- [ ] **Step 5: Commit**

```bash
git add src/v3/lifecycle/applyNowCrossPromotion.ts src/v3/lifecycle/applyNowCrossPromotion.test.ts
git commit -m "feat(lifecycle): applyNowCrossPromotion helper (ADR-0001)"
```

### Task 4.2: Wire into projection output

- [ ] **Step 1: Find where engine output is consumed by the UI. Likely `src/v3/renderProjection.ts` or a hook like `useProjection`. Read it.**

- [ ] **Step 2: Write a seam-coverage integration test using the REAL engine + REAL renderProjection.**

```ts
// src/v3/renderProjection.test.ts (new test block)
describe("F66 Now-cross integration — ADR-0001", () => {
  it("a projected bottle whose time is past `now` appears as recorded in the rendered projection", () => {
    const now = 13 * 60;
    const ctx = buildCtx({ /* ... defaults */ });
    const day = buildDay({ events: [recordedBottle({ startTime: 8 * 60 })] });
    // Engine should project a cascade bottle at, say, 11:00 (interval = 180min from 8:00).
    // With now = 13:00, that 11:00 projection must appear as recorded.
    const rendered = renderProjection(ctx, day, now);
    const elevenBottle = rendered.find((e) => e.type === "bottle" && e.startTime === 11 * 60);
    expect(elevenBottle).toBeDefined();
    expect(elevenBottle!.lifecycle.state).toBe("recorded");
  });
});
```

- [ ] **Step 3: Run to verify FAIL** — the projection currently leaves it `projected`.

- [ ] **Step 4: Call `applyNowCrossPromotion` at the end of `renderProjection` before returning events.**

```ts
// src/v3/renderProjection.ts (before return at the end)
import { applyNowCrossPromotion } from "./lifecycle/applyNowCrossPromotion";
// ...
return applyNowCrossPromotion(events, ctx.nowMinutes ?? now);
```

- [ ] **Step 5: Run test to verify PASS.**

- [ ] **Step 6: Run full unit suite. Fix any tests that asserted `lifecycle.state === "projected"` for past events.**

- [ ] **Step 7: Commit**

```bash
git add src/v3/renderProjection.ts src/v3/renderProjection.test.ts
git commit -m "feat(render): apply Now-cross promotion in projection (ADR-0001)"
```

### Task 4.3: Remove dashboard action buttons

- [ ] **Step 1: Find every component consuming `NapActionButton` / `StartBottleButton` / "Start Bedtime Now."**

```bash
grep -rn "NapActionButton\|StartBottleButton\|onStartBedtime\|onStartNap" src/ --include="*.tsx"
```

- [ ] **Step 2: For Dashboard.tsx: remove the imports and JSX for those buttons. KEEP a new minimal "End Nap Now" button that only renders when there's an in-progress recorded nap (startTime ≤ now < endTime). This button calls a new `closeNapNow(napId, now)` handler that writes `endTime = now` and `lifecycle = completed` to the existing nap doc.**

```tsx
// src/v3/components/Dashboard/EndNapNowButton.tsx (NEW)
import { useChild } from "../../hooks/useChild";

export function EndNapNowButton({ inProgressNap }: { inProgressNap: Event | null }) {
  const { closeNapNow } = useChild();
  if (!inProgressNap) return null;
  return (
    <button
      onClick={() => closeNapNow(inProgressNap.id)}
      className="..."
    >
      End nap now
    </button>
  );
}
```

- [ ] **Step 3: Write integration test for End Nap Now using real Firestore emulator.**

```ts
// tests/integration/endNapNow.test.ts
import { startTestEnv, ALLOWED_USER } from "./firestore-test-utils";

describe("End Nap Now — ADR-0001 in-progress carve-out", () => {
  it("sets endTime to now and completes the lifecycle", async () => {
    const env = await startTestEnv();
    // Seed a recorded in-progress nap (startTime past, endTime future).
    const napId = await writeRecordedNap(env, ALLOWED_USER, {
      startTime: hm("13:00"),
      endTime: hm("14:00"),
    });
    const now = hm("13:30");
    await closeNapNow(env, ALLOWED_USER, napId, now);
    const doc = await readNap(env, ALLOWED_USER, napId);
    expect(doc.endTime).toBe(now);
    expect(doc.lifecycle.state).toBe("completed");
  });
});
```

- [ ] **Step 4: Implement `closeNapNow` in the relevant hook/service (e.g. `src/v3/hooks/useChild.ts` or `src/v3/firestore/writers.ts`). Write the test, run integration suite.**

- [ ] **Step 5: Delete `NapActionButton.tsx` and `StartBottleButton.tsx`. Update all imports.**

- [ ] **Step 6: Run `pnpm test` and `pnpm test:integration`. Restart firestore emulator after integration tests (per AGENTS.md).**

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(dashboard): remove start-* action buttons, keep End Nap Now only (ADR-0001)"
```

### Task 4.4: Open PR

- [ ] Push, open PR titled `feat: F66 PR 4 — Now-cross auto-promote + remove dashboard buttons (ADR-0001)`. PR body:
  - ADR-0001 link
  - **Contaminated data** section: existing docs persist as-is; new behavior auto-promotes future projections at Now-cross. No migration needed (history doesn't load per AGENTS.md).
  - Click-test steps:
    1. Open /timeline at, say, 2pm with morning bottles already recorded
    2. Confirm projected cascade bottles whose time < 2pm appear styled as recorded (not projected) — color or solid vs ghosted
    3. Confirm dashboard has NO "Start Bottle" / "Start Nap" / "Start Bedtime" buttons
    4. Record an in-progress nap (drawer FAB → save with start=now-15min, end=now+30min). Confirm "End Nap Now" button appears
    5. Click "End Nap Now". Confirm the nap's endTime updates to current time and the button disappears

---

## PR 5 — Drawer: future-event = owner-only edit

**Files:**
- Modify: `src/v3/components/shared/EventEditDrawerV3.tsx:231-258` (handleSave)
- Modify: drawer form fields (disable/hide time/amount when event is future-projected)
- Modify: `src/v3/lifecycle.ts:137-173` (DRAWER_SAVE reducer)
- Test: `src/v3/components/shared/EventEditDrawerV3.test.tsx` (or new)

### Task 5.1: Predicate + UI gating

- [ ] **Step 1: Add helper `isFutureProjected(event, now)`.**

```ts
// src/v3/lifecycle.ts (export from existing file)
export function isFutureProjected(event: Event, now: number): boolean {
  return event.lifecycle.state === "projected" && event.startTime > now;
}
```

- [ ] **Step 2: Failing test — drawer should NOT call setTime() handler when event is future-projected.**

```tsx
// src/v3/components/shared/EventEditDrawerV3.test.tsx (new describe)
describe("Future-event drawer — ADR-0001 §future-event drawer rule", () => {
  it("disables time field when event is future projected", () => {
    const now = hm("12:00");
    const futureProjected = projectedNap({ startTime: hm("14:00"), endTime: hm("14:45") });
    render(<EventEditDrawerV3 event={futureProjected} now={now} />);
    const timeInput = screen.getByLabelText(/start time/i);
    expect(timeInput).toBeDisabled();
  });

  it("keeps owner field editable for future projected", () => {
    const now = hm("12:00");
    const futureProjected = projectedNap({ startTime: hm("14:00"), endTime: hm("14:45") });
    render(<EventEditDrawerV3 event={futureProjected} now={now} />);
    const ownerSelect = screen.getByLabelText(/owner/i);
    expect(ownerSelect).not.toBeDisabled();
  });

  it("amount field is disabled on future-projected bottle", () => {
    const now = hm("12:00");
    const futureBottle = projectedBottle({ startTime: hm("13:00"), amountOz: 5 });
    render(<EventEditDrawerV3 event={futureBottle} now={now} />);
    const amountInput = screen.getByLabelText(/amount/i);
    expect(amountInput).toBeDisabled();
  });
});
```

- [ ] **Step 3: Run tests to verify FAIL.**

- [ ] **Step 4: Gate the form fields. In `EventEditDrawerV3.tsx`, read `now` from a hook (e.g. `useNow()`); compute `const futureProjected = isFutureProjected(sourceEvent, now);`; pass `disabled={futureProjected}` to time/end-time/amount inputs.**

- [ ] **Step 5: Run tests to verify PASS.**

- [ ] **Step 6: Commit**

```bash
git add src/v3/lifecycle.ts src/v3/components/shared/EventEditDrawerV3.tsx src/v3/components/shared/EventEditDrawerV3.test.tsx
git commit -m "feat(drawer): future-projected events have owner-only edit (ADR-0001)"
```

### Task 5.2: Reducer side — defensive

- [ ] **Step 1: Even with UI disabled, the reducer should treat a future-projected save's time/amount fields as unchanged. Failing test in `lifecycle.test.ts`:**

```ts
it("DRAWER_SAVE on future projected ignores time/amount changes (owner-only)", () => {
  const original = projectedNap({ startTime: hm("14:00"), endTime: hm("14:45"), ownerSlot: "parent1" });
  const tampered = { ...original, startTime: hm("13:00"), ownerSlot: "parent2" };
  const out = reduceLifecycle(original, { type: "DRAWER_SAVE", next: tampered, now: hm("12:00") });
  expect(out.startTime).toBe(hm("14:00")); // ignored
  expect(out.ownerSlot).toBe("parent2"); // kept
  expect(out.lifecycle.state).toBe("projected"); // no promotion
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: In `src/v3/lifecycle.ts` DRAWER_SAVE case (line ~137), branch on `isFutureProjected(original, action.now)`. If true, copy only owner fields from `action.next`, leave lifecycle as `projected`.**

- [ ] **Step 4: Run, expect PASS. Full test suite.**

- [ ] **Step 5: Commit**

```bash
git add src/v3/lifecycle.ts src/v3/lifecycle.test.ts
git commit -m "feat(lifecycle): DRAWER_SAVE on future projected = owner-only (ADR-0001)"
```

### Task 5.3: Open PR

- [ ] Click-test steps in PR body:
  1. Open /timeline at, say, noon. Find a projected nap chip later in the day
  2. Open drawer. Confirm start-time and end-time fields are disabled/greyed
  3. Confirm owner dropdown is enabled. Change owner to Daycare. Save
  4. Confirm timeline reflects owner change but nap time unchanged
  5. Open drawer on a PAST recorded chip. Confirm all fields are editable

---

## PR 6 — Settings: `dreamFeedTime` + special bottle anchor

**Files:**
- Modify: `src/v3/schemas.ts` (Settings type)
- Modify: `src/v3/firestore/settingsDefaults.ts`
- Modify: `src/v3/engine/rules/bottles.ts` (anchor a "dream feed" bottle if enabled)
- Modify: `src/app/(signed-in-with-child)/settings/page.tsx`
- Test: bottles.test.ts

### Task 6.1: Settings field

- [ ] **Step 1: Failing test — DEFAULTS.dreamFeed.enabled === false and DEFAULTS.dreamFeed.time === 23:00.**

- [ ] **Step 2: Add to Settings type:**

```ts
// src/v3/schemas.ts (in Settings type)
dreamFeed: {
  enabled: boolean;
  time: TimeMin;
};
```

- [ ] **Step 3: Defaults:**

```ts
dreamFeed: { enabled: false, time: minutesFromHHMM("23:00") },
```

- [ ] **Step 4: Run test — PASS.**

- [ ] **Step 5: Commit.**

### Task 6.2: Engine anchor

- [ ] **Step 1: Failing test — when `dreamFeed.enabled`, projection includes a bottle at `dreamFeed.time` with default amount.**

- [ ] **Step 2: In `bottles.ts`, before the main cascade, inject a projected dream-feed bottle if enabled and no recorded bottle exists in `[dreamFeed.time - 60, dreamFeed.time + 60]`. The dream feed counts toward `bottlesPerDay`.**

```ts
// src/v3/engine/rules/bottles.ts (early in projectBottleChain)
if (ctx.settings.dreamFeed.enabled) {
  const dfTime = ctx.settings.dreamFeed.time;
  const hasRecordedNearby = bottles.some(
    (b) => isRecorded(b.lifecycle) && Math.abs(b.startTime - dfTime) < 60,
  );
  if (!hasRecordedNearby) {
    events.push(buildProjectedBottle(ctx, dfTime, ctx.settings.defaultBottleOz));
  }
}
```

- [ ] **Step 3: Run test — PASS. Confirm Now-cross auto-promote (PR4) makes this dream feed auto-record at projected time when Now crosses it.**

- [ ] **Step 4: Commit.**

### Task 6.3: UI + PR

- [ ] **Step 1: Add a checkbox + TimeRow for dream feed in settings page. Match existing patterns.**

- [ ] **Step 2: Open PR. Click-test:**
  1. Settings → enable Dream Feed, time 11:00pm. Save
  2. /timeline shows a projected bottle at 11pm
  3. Wait until past 11pm (or sim — use the dev `?now=` query param if your repo has one). Confirm bottle appears as recorded

---

## PR 7 — Docs sweep

**Files:**
- Modify: `DOMAIN.md` (lines 24-57, 60-120, 123-150)
- Modify: `docs/v3/DATA_MODEL.md` (R1.4, R1.8, R2.1, R2.2, §14)
- Modify: `docs/v3/ENGINE_SPEC.md` (§3 nap rules R7.5/7.6/7.11, §6 putdown)
- Move to completed: `docs/v3/fast-follow/grill/f58-dream-feed-default-time.md` → `f58-...-COMPLETED.md` entry in `docs/v3/fast-follow/FAST_FOLLOW_COMPLETED.md`
- Same for: `f62`, `f64`. Update `§F48`, `§F54`, `§F59` entries to note partial subsumption.
- Move: `docs/v3/fast-follow/grill/f66-cascade-and-state-model-audit.md` → `docs/v3/fast-follow/grill/f66-cascade-and-state-model-audit-COMPLETED.md` reference in `FAST_FOLLOW_COMPLETED.md`

### Tasks

- [ ] **Step 1:** In DATA_MODEL.md R2.2, replace the line `projected → recorded (NapActionButton "Start Nap Now", or drawer owner-only edit)` with a Now-cross promotion rule documented as the canonical transition.
- [ ] **Step 2:** In ENGINE_SPEC.md §3 R7.5/R7.6/R7.11, replace the nap→bedtime substitution rule with the new "drop nap if endTime > bedtimeThreshold; bedtime = max(earliestBedtime, lastNapEnd + WW)" rule. Link ADR-0002.
- [ ] **Step 3:** In DOMAIN.md §3, refine bedtime description to clarify the two-knob model (Jake's lived language only — no engineer extrapolation).
- [ ] **Step 4:** Update `FAST_FOLLOW_COMPLETED.md` with entries for §F58, §F62, §F64, §F66. Compress each per the workspace doc-hygiene rule (heading + one-sentence + PR number).
- [ ] **Step 5:** Commit and open docs-only PR.

---

## Self-review

**Spec coverage:**
- ✓ ADR-0001 Now-cross auto-promote → PR4
- ✓ ADR-0001 dashboard button removal → PR4
- ✓ ADR-0001 future-drawer rule → PR5
- ✓ ADR-0002 `earliestBedtime` floor → PR1 + PR2
- ✓ ADR-0002 `bedtimeThreshold` semantic inversion → PR1 + PR2
- ✓ Putdown bottle-anchor (CONTEXT.md) → PR3
- ✓ Dream feed (CONTEXT.md) → PR6
- ✓ Doc updates → PR7

**Placeholder scan:** All steps have concrete code or named files. No "TBD" / "handle edge cases" / "similar to" remnants.

**Type consistency:** `applyNowCrossPromotion` signature consistent across uses; `isFutureProjected(event, now)` defined once and reused.

**Independent mergeability:** PR1 ships alone (defaults + UI, no behavior change). PR2 depends on PR1 only. PR3 is independent of PR2 (parallel). PR4 depends on PR2. PR5 depends on PR4. PR6 depends on PR1. PR7 closes the loop on docs.

**Pre-flight per workspace rule:** Each branch starts from fresh `origin/main`:
```bash
git fetch origin main && git checkout main && git pull --ff-only && git checkout -b <branch>
```

**Testing per workspace rule + AGENTS.md:**
- Engine tests use real `projectDay`. No `vi.mock("../engine/projectDay")`.
- Write-path tests (PR4 Task 4.3, PR6) use the Firestore emulator (`tests/integration/firestore-test-utils.ts`).
- Restart firebase emulator after `pnpm test:integration`.
- No `.toBeInTheDocument()`.
- Seam coverage: PR4 Task 4.2 explicitly tests render-side seam with real engine.

**Per-PR memory checks:**
- Click-test steps in every PR body.
- Each PR fires up dev server on :3001 with `.env.local` copied for verification.
- Parallel agents: distinct branch names per PR (declared above).
- After PR open: dispatch code-reviewer (opus) + code-simplifier (sonnet) in parallel per `feedback_parallel_pr_review_loop`.
- Write-path-touching PRs (PR4 Task 4.3, PR6): Contaminated Data section required.

---

## Execution handoff

Plan saved to `docs/v3/F66_PLAN.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task using `superpowers:subagent-driven-development`. Review between tasks, fast iteration. Best for the larger PR4.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`. Batch execution with checkpoints for review.

Which approach?
