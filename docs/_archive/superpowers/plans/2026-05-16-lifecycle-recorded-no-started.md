# V3 Lifecycle Simplification: Drop `started`, Rename `overridden → recorded`, Auto-extend In-Progress Naps

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify V3 lifecycle to `{ projected | recorded | completed }` — drop `started`, rename `overridden → recorded`, and derive "in-progress" from time rather than state.

**Architecture:** Add `effectiveEndOf()` utility that auto-extends recorded in-progress naps up to 3 times (cap at startTime + 4×napLen). Rename `overridden → recorded` throughout. Drop `started` state and the `START`/`END` actions. NapActionButton "Start Nap Now" mints a nap with startTime + endTime placeholder + lifecycle `recorded`. `handleEndNap` uses `TIME_EDIT` action to transition `recorded → completed`.

**Tech Stack:** TypeScript, Vitest, React, Next.js (App Router)

---

## Branch setup

Before Task 1, create the branch:

```bash
cd /Users/jakemosher/Workspace/baby-day-planner
git fetch origin main && git checkout main && git pull --ff-only && git checkout -b refactor/v3-lifecycle-recorded-no-started
```

---

## File map

| File | Action | Purpose |
|------|--------|---------|
| `src/v3/lib/effectiveEnd.ts` | **CREATE** | Pure helper: `effectiveEndOf(event, napLen, now)` with capped auto-extend |
| `src/v3/lib/effectiveEnd.test.ts` | **CREATE** | Unit tests for the 5+ effectiveEnd cases |
| `src/v3/schemas.ts` | **MODIFY** | Drop `started`, rename `overridden → recorded` in Lifecycle union; update `isRecorded` |
| `src/v3/lifecycle.ts` | **MODIFY** | Drop `START`/`END` actions, rename `overridden → recorded` in all cases |
| `src/v3/lifecycle.test.ts` | **MODIFY** | Drop `START`/`END` tests, update renamed states, add DRAWER_SAVE `recorded` cases |
| `src/v3/engine/evaluator.ts` | **MODIFY** | `sameLifecycle`: drop `started` case, rename `overridden → recorded` |
| `src/v3/engine/rules/putdown.ts` | **MODIFY** | R6.1 predicate: `projected || overridden` → `projected || recorded` |
| `src/v3/engine/rules/naps.ts` | **MODIFY** | Cursor advancement uses `effectiveEndOf`; rename `overridden` refs |
| `src/v3/engine/rules/naps.test.ts` | **MODIFY** | Rename `overridden` / `started` refs; add auto-extend cascade test |
| `src/v3/components/Timeline/expandPutdown.ts` | **MODIFY** | `isInProgressSleep` time-based; `windowOverlapsInProgressSleep` uses effectiveEnd |
| `src/v3/components/Timeline/expandPutdown.test.ts` | **MODIFY** | Rename state refs; add cap test |
| `src/v3/components/Dashboard/NapActionButton.tsx` | **MODIFY** | Start Nap: set endTime; Start Bedtime: set endTime; use `recorded` lifecycle |
| `src/v3/components/Dashboard/NapActionButton.test.tsx` | **MODIFY** | Assert endTime set, lifecycle `recorded` not `started` |
| `src/app/(authed)/page.tsx` | **MODIFY** | `handleEndNap` uses `TIME_EDIT`; `inProgressNap` selector time-based; pass new props |
| `src/v3/__tests__/startNapThenRender.test.ts` | **MODIFY** | Update `started` → `recorded`; add cap test |
| `src/v3/__tests__/factories.ts` | **MODIFY** | `aRecordedNap` default lifecycle; helper for `started` state removed |
| `docs/v3/DATA_MODEL.md` | **MODIFY** | Update lifecycle state definitions |
| `docs/v3/ENGINE_SPEC.md` | **MODIFY** | Update any rule that references `started` or `overridden` |

---

## Task 1: Create `effectiveEndOf` utility

**Files:**
- Create: `src/v3/lib/effectiveEnd.ts`
- Create: `src/v3/lib/effectiveEnd.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/v3/lib/effectiveEnd.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Event } from "../schemas";
import { effectiveEndOf } from "./effectiveEnd";

const napLen = 60; // minutes

function recordedNap(startTime: number, endTime: number): Event {
  return {
    id: "nap_1",
    dayId: "day_test",
    eventKey: "nap_1",
    type: "nap",
    kind: "block",
    label: "Nap 1",
    startTime,
    endTime,
    hasPutdown: false,
    lifecycle: { state: "recorded", annotatedAt: startTime },
  };
}

describe("effectiveEndOf", () => {
  it("returns endTime when now <= endTime (not yet overrun)", () => {
    const nap = recordedNap(9 * 60, 10 * 60);
    expect(effectiveEndOf(nap, napLen, 9 * 60 + 30)).toBe(10 * 60);
  });

  it("extends by 1 napLen when now is just past endTime", () => {
    const nap = recordedNap(9 * 60, 10 * 60);
    // now = 10:01 → 1 extension → effectiveEnd = 11:00
    expect(effectiveEndOf(nap, napLen, 10 * 60 + 1)).toBe(11 * 60);
  });

  it("extends by 2 napLens when now is in the second extension window", () => {
    const nap = recordedNap(9 * 60, 10 * 60);
    // now = 11:01 → 2 extensions → effectiveEnd = 12:00
    expect(effectiveEndOf(nap, napLen, 11 * 60 + 1)).toBe(12 * 60);
  });

  it("caps at 3 extensions (startTime + 4×napLen) even when now is far beyond", () => {
    const nap = recordedNap(9 * 60, 10 * 60);
    // cap = 9:00 + 4*60 = 13:00. now = 15:00 >> cap
    expect(effectiveEndOf(nap, napLen, 15 * 60)).toBe(13 * 60);
  });

  it("passes through for projected events (state !== 'recorded')", () => {
    const nap: Event = {
      id: "nap_1",
      dayId: "day_test",
      eventKey: "nap_1",
      type: "nap",
      kind: "block",
      label: "Nap 1",
      startTime: 9 * 60,
      endTime: 10 * 60,
      hasPutdown: false,
      lifecycle: { state: "projected" },
    };
    // projected — no extension regardless of now
    expect(effectiveEndOf(nap, napLen, 11 * 60)).toBe(10 * 60);
  });

  it("passes through for completed events (state === 'completed')", () => {
    const nap: Event = {
      id: "nap_1",
      dayId: "day_test",
      eventKey: "nap_1",
      type: "nap",
      kind: "block",
      label: "Nap 1",
      startTime: 9 * 60,
      endTime: 9 * 60 + 30,
      hasPutdown: false,
      lifecycle: { state: "completed", committedAt: 9 * 60 },
    };
    expect(effectiveEndOf(nap, napLen, 11 * 60)).toBe(9 * 60 + 30);
  });

  it("returns endTime when now exactly equals endTime (not overrun)", () => {
    const nap = recordedNap(9 * 60, 10 * 60);
    expect(effectiveEndOf(nap, napLen, 10 * 60)).toBe(10 * 60);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner && pnpm test -- src/v3/lib/effectiveEnd.test.ts 2>&1 | tail -20
```

Expected: FAIL — `effectiveEnd.ts` doesn't exist yet.

- [ ] **Step 3: Implement `effectiveEndOf`**

Create `src/v3/lib/effectiveEnd.ts`:

```ts
/**
 * Derives the effective end time for an in-progress recorded nap.
 *
 * An in-progress nap (lifecycle.state === "recorded") may run past its
 * placeholder endTime. When `now > event.endTime`, the effective end
 * auto-extends by one napLen per extension window, capped at 3 extensions
 * (= startTime + 4×napLen).
 *
 * Used by:
 *   - cascade cursor advancement (naps.ts)
 *   - inProgressNap selector (page.tsx)
 *   - putdown overlap gate (expandPutdown.ts)
 *   - timeline renderer end computation
 *
 * Only extends for `lifecycle.state === "recorded"`. All other states
 * (projected, completed) pass through `event.endTime ?? event.startTime`.
 */

import type { Event, TimeMin } from "../schemas";

export function effectiveEndOf(event: Event, napLen: number, now: TimeMin): TimeMin {
  const { lifecycle, startTime, endTime } = event;

  if (lifecycle.state !== "recorded" || endTime === undefined) {
    return endTime ?? startTime;
  }

  if (now <= endTime) return endTime;

  const extensions = Math.min(3, Math.floor((now - endTime) / napLen) + 1);
  return endTime + extensions * napLen;
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner && pnpm test -- src/v3/lib/effectiveEnd.test.ts 2>&1 | tail -10
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner
git add src/v3/lib/effectiveEnd.ts src/v3/lib/effectiveEnd.test.ts
git commit -m "feat(v3): effectiveEndOf — auto-extend recorded in-progress naps (capped at 3 extensions)"
```

---

## Task 2: Rename `overridden → recorded` and drop `started` in schemas.ts

**Files:**
- Modify: `src/v3/schemas.ts`

- [ ] **Step 1: Identify the current type definitions**

In `src/v3/schemas.ts`, the current Lifecycle union is:
```ts
export type Lifecycle =
  | { state: "projected" }
  | { state: "started"; committedAt: TimeMin }
  | { state: "completed"; committedAt: TimeMin }
  | { state: "overridden"; annotatedAt: TimeMin };
```

And `isRecorded` is:
```ts
export function isRecorded(lifecycle: Lifecycle): boolean {
  return lifecycle.state === "started" || lifecycle.state === "completed";
}
```

The comment at the top of the file says `// recorded === state ∈ {started, completed}` — this is stale.

**Callers of `isRecorded` audit:**
- `src/app/(authed)/page.tsx`: `bottle1Pending = !actuals.some(e => e.type === "bottle" && isRecorded(e.lifecycle))` — wants "user-committed" bottles. `recorded || completed` is correct.
- `src/app/(authed)/page.tsx`: `uniqueRecordedKeys` — same intent, correct.
- `src/app/(authed)/page.tsx`: `lastEventOfType` — same intent, correct.
- `src/v3/engine/evaluator.ts`: `checkRealityWins` uses `isRecorded` to identify protected events. Under the new model, `recorded || completed` are both user-anchored — the reality-wins guard should protect both. Correct.
- `src/v3/engine/helpers.ts`: `isRecordedEvent` wraps `isRecorded`. Same intent.
- `src/v3/engine/rules/naps.ts` comment mentions `recorded/overridden` — textual only.
- `src/v3/repositories/events.ts` (if any) — check below.

The new `isRecorded` should be `state === "recorded" || state === "completed"`.

- [ ] **Step 2: Update `schemas.ts`**

Open `src/v3/schemas.ts` and make these changes:

1. Update the file-level comment on line 11 from:
   ```ts
   // - Lifecycle is a discriminated union; recorded === state ∈ {started, completed}.
   ```
   to:
   ```ts
   // - Lifecycle is a discriminated union; recorded === state ∈ {recorded, completed}.
   ```

2. Update the Lifecycle union (lines 79-83):
   ```ts
   export type Lifecycle =
     | { state: "projected" }
     | { state: "recorded"; annotatedAt: TimeMin }
     | { state: "completed"; committedAt: TimeMin };
   ```

3. Update the JSDoc above Lifecycle (lines 68-78):
   ```ts
   /**
    * Discriminated union replacing V2's source + status + recorded triplet.
    *
    *   projected   — engine output, never persisted
    *   recorded    — user has anchored at least one timestamp; event is real.
    *                 Placeholder endTime may still auto-extend for in-progress naps.
    *   completed   — user has anchored both start AND end timestamps
    *
    * Instants jump straight from projected → completed.
    * Blocks (nap, bedtime) go projected → recorded → completed.
    */
   ```

4. Update `isRecorded` (lines 85-88):
   ```ts
   /** True when the event is a recording of reality (recorded or completed). */
   export function isRecorded(lifecycle: Lifecycle): boolean {
     return lifecycle.state === "recorded" || lifecycle.state === "completed";
   }
   ```

5. Update the Context JSDoc comment that says `lifecycle.state ∈ {started, completed}`:
   ```ts
   /** User-recorded events from Firestore (lifecycle.state ∈ {recorded, completed}). */
   actuals: Event[];
   ```

- [ ] **Step 3: Run typecheck to identify all breakages**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner && pnpm typecheck 2>&1 | head -60
```

This will show all files that reference the old states. Use this list to guide the remaining tasks. Do not fix yet — just observe.

- [ ] **Step 4: Commit the schema change**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner
git add src/v3/schemas.ts
git commit -m "refactor(v3): Lifecycle union — drop started, rename overridden→recorded"
```

---

## Task 3: Update lifecycle.ts (reducer + actions)

**Files:**
- Modify: `src/v3/lifecycle.ts`
- Modify: `src/v3/lifecycle.test.ts`

- [ ] **Step 1: Write updated tests first**

Replace `src/v3/lifecycle.test.ts` entirely:

```ts
import { describe, expect, it } from "vitest";
import {
  LifecycleTransitionError,
  isSchedulingType,
  reduceLifecycle,
  type LifecycleAction,
} from "./lifecycle";
import type { Lifecycle } from "./schemas";

const projected: Lifecycle = { state: "projected" };

describe("reduceLifecycle — valid transitions", () => {
  it("projected → completed via RECORD_INSTANT for instant events", () => {
    const next = reduceLifecycle(projected, {
      type: "RECORD_INSTANT",
      at: 9 * 60,
      eventKind: "instant",
    });
    expect(next).toEqual({ state: "completed", committedAt: 9 * 60 });
  });

  it("projected → recorded via OWNER_EDIT (annotates with no time change)", () => {
    const next = reduceLifecycle(projected, {
      type: "OWNER_EDIT",
      at: 8 * 60,
    });
    expect(next).toEqual({ state: "recorded", annotatedAt: 8 * 60 });
  });

  it("recorded → completed via TIME_EDIT", () => {
    const recorded: Lifecycle = { state: "recorded", annotatedAt: 8 * 60 };
    const next = reduceLifecycle(recorded, { type: "TIME_EDIT", at: 12 * 60 });
    expect(next).toEqual({ state: "completed", committedAt: 12 * 60 });
  });

  it("projected → completed via TIME_EDIT", () => {
    const next = reduceLifecycle(projected, { type: "TIME_EDIT", at: 12 * 60 });
    expect(next).toEqual({ state: "completed", committedAt: 12 * 60 });
  });

  it("OWNER_EDIT on a completed event is a no-op (returns same state)", () => {
    const completed: Lifecycle = { state: "completed", committedAt: 13 * 60 };
    const next = reduceLifecycle(completed, { type: "OWNER_EDIT", at: 14 * 60 });
    expect(next).toBe(completed);
  });

  it("OWNER_EDIT on a recorded event is a no-op (stays recorded)", () => {
    const recorded: Lifecycle = { state: "recorded", annotatedAt: 8 * 60 };
    const next = reduceLifecycle(recorded, { type: "OWNER_EDIT", at: 14 * 60 });
    expect(next).toBe(recorded);
  });
});

describe("reduceLifecycle — invalid transitions", () => {
  it("throws if RECORD_INSTANT is called with kind=block", () => {
    expect(() =>
      reduceLifecycle(projected, {
        type: "RECORD_INSTANT",
        at: 9 * 60,
        eventKind: "block",
      }),
    ).toThrow(/instant-only/);
  });
});

describe("isSchedulingType", () => {
  it.each(["nap", "bedtime", "daily_recurring"] as const)("isSchedulingType(%s) → true", (type) =>
    expect(isSchedulingType(type)).toBe(true),
  );
  it.each(["bottle", "pump", "extra", "wake_window", "daycare_dropoff", "daycare_pickup"] as const)(
    "isSchedulingType(%s) → false",
    (type) => expect(isSchedulingType(type)).toBe(false),
  );
});

describe("reduceLifecycle — DRAWER_SAVE", () => {
  const NOW = 8 * 60 + 30;

  // ── projected source ──────────────────────────────────────────────────────

  it("projected nap + time changed + endTime present → recorded (scheduling type)", () => {
    const next = reduceLifecycle(
      { state: "projected" },
      {
        type: "DRAWER_SAVE",
        eventType: "nap",
        eventKind: "block",
        timeChanged: true,
        hasEndTime: true,
        nowMinutes: NOW,
      },
    );
    expect(next).toEqual({ state: "recorded", annotatedAt: NOW });
  });

  it("projected bedtime + time changed → recorded (scheduling type)", () => {
    const next = reduceLifecycle(
      { state: "projected" },
      {
        type: "DRAWER_SAVE",
        eventType: "bedtime",
        eventKind: "block",
        timeChanged: true,
        hasEndTime: true,
        nowMinutes: NOW,
      },
    );
    expect(next).toEqual({ state: "recorded", annotatedAt: NOW });
  });

  it("projected daily_recurring + time changed → recorded (scheduling type)", () => {
    const next = reduceLifecycle(
      { state: "projected" },
      {
        type: "DRAWER_SAVE",
        eventType: "daily_recurring",
        eventKind: "block",
        timeChanged: true,
        hasEndTime: true,
        nowMinutes: NOW,
      },
    );
    expect(next).toEqual({ state: "recorded", annotatedAt: NOW });
  });

  it("projected bottle (instant) + time changed → completed (recording type)", () => {
    const next = reduceLifecycle(
      { state: "projected" },
      {
        type: "DRAWER_SAVE",
        eventType: "bottle",
        eventKind: "instant",
        timeChanged: true,
        hasEndTime: false,
        nowMinutes: NOW,
      },
    );
    expect(next).toEqual({ state: "completed", committedAt: NOW });
  });

  it("projected extra (block) + time changed + endTime → completed (recording type)", () => {
    const next = reduceLifecycle(
      { state: "projected" },
      {
        type: "DRAWER_SAVE",
        eventType: "extra",
        eventKind: "block",
        timeChanged: true,
        hasEndTime: true,
        nowMinutes: NOW,
      },
    );
    expect(next).toEqual({ state: "completed", committedAt: NOW });
  });

  it("projected extra (block) + time changed + no endTime → recorded (in-progress block)", () => {
    const next = reduceLifecycle(
      { state: "projected" },
      {
        type: "DRAWER_SAVE",
        eventType: "extra",
        eventKind: "block",
        timeChanged: true,
        hasEndTime: false,
        nowMinutes: NOW,
      },
    );
    expect(next).toEqual({ state: "recorded", annotatedAt: NOW });
  });

  it("projected + no time change (owner/amount only) → recorded", () => {
    const next = reduceLifecycle(
      { state: "projected" },
      {
        type: "DRAWER_SAVE",
        eventType: "bottle",
        eventKind: "instant",
        timeChanged: false,
        hasEndTime: false,
        nowMinutes: NOW,
      },
    );
    expect(next).toEqual({ state: "recorded", annotatedAt: NOW });
  });

  // ── recorded source ─────────────────────────────────────────────────────

  it("recorded nap + time changed → recorded (idempotent re-scheduling)", () => {
    const next = reduceLifecycle(
      { state: "recorded", annotatedAt: 8 * 60 },
      {
        type: "DRAWER_SAVE",
        eventType: "nap",
        eventKind: "block",
        timeChanged: true,
        hasEndTime: true,
        nowMinutes: NOW,
      },
    );
    expect(next).toEqual({ state: "recorded", annotatedAt: NOW });
  });

  it("recorded bottle + time changed → completed (locks in the time)", () => {
    const next = reduceLifecycle(
      { state: "recorded", annotatedAt: 7 * 60 },
      {
        type: "DRAWER_SAVE",
        eventType: "bottle",
        eventKind: "instant",
        timeChanged: true,
        hasEndTime: false,
        nowMinutes: NOW,
      },
    );
    expect(next).toEqual({ state: "completed", committedAt: NOW });
  });

  it("recorded + no time change (field edit only) → lifecycle unchanged", () => {
    const recorded: Lifecycle = { state: "recorded", annotatedAt: 7 * 60 };
    const next = reduceLifecycle(recorded, {
      type: "DRAWER_SAVE",
      eventType: "nap",
      eventKind: "block",
      timeChanged: false,
      hasEndTime: true,
      nowMinutes: NOW,
    });
    expect(next).toBe(recorded);
  });

  // ── already-completed stays frozen ─────────────────────────────────────

  it("completed event stays completed; committedAt is unchanged", () => {
    const completed: Lifecycle = { state: "completed", committedAt: 10 * 60 };
    const next = reduceLifecycle(completed, {
      type: "DRAWER_SAVE",
      eventType: "bottle",
      eventKind: "instant",
      timeChanged: true,
      hasEndTime: false,
      nowMinutes: NOW,
    });
    expect(next).toBe(completed);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner && pnpm test -- src/v3/lifecycle.test.ts 2>&1 | tail -20
```

Expected: many failures — references to `started`/`overridden` states that no longer exist.

- [ ] **Step 3: Rewrite lifecycle.ts**

Replace `src/v3/lifecycle.ts` entirely:

```ts
/**
 * Lifecycle state-machine reducer.
 *
 * Source: docs/v3/DATA_MODEL.md §2.
 *
 * State transitions:
 *
 *                projected
 *                    │
 *      ┌─────────────┼──────────────────┬───────────────┐
 *      │ Record inst │ Time-edit         │ Owner-only    │ DRAWER_SAVE (sched type)
 *      ▼             ▼                  ▼               ▼
 *   completed      completed          completed       recorded ──Time-edit──→ completed
 *
 * - `recorded` = user anchored at least one timestamp (blocks in-progress or
 *   scheduling annotations). For non-scheduling types, recorded → completed on
 *   any time-edit.
 * - `completed` = both start AND end are user-anchored. Once completed, frozen.
 * - Instants jump projected → completed directly.
 */

import type { EventKind, EventType, Lifecycle, TimeMin } from "./schemas";

/**
 * Event types for which drawer time-edits are scheduling intent, not
 * recordings of reality.
 *
 * - `nap` / `bedtime`: action buttons own the flow; the drawer is scheduling.
 * - `daily_recurring`: no action buttons; a drawer time-edit is a one-day reschedule.
 *
 * This is the single authoritative predicate — import from here rather
 * than duplicating the list. (DATA_MODEL.md §2)
 */
export function isSchedulingType(type: EventType): boolean {
  return type === "nap" || type === "bedtime" || type === "daily_recurring";
}

export type LifecycleAction =
  | { type: "RECORD_INSTANT"; at: TimeMin; eventKind: EventKind }
  | { type: "TIME_EDIT"; at: TimeMin }
  | { type: "OWNER_EDIT"; at: TimeMin }
  | {
      type: "DRAWER_SAVE";
      eventType: EventType;
      eventKind: EventKind;
      timeChanged: boolean;
      hasEndTime: boolean;
      nowMinutes: TimeMin;
    };

export class LifecycleTransitionError extends Error {
  readonly fromState: Lifecycle["state"];
  readonly action: LifecycleAction["type"];

  constructor(from: Lifecycle["state"], action: LifecycleAction["type"], reason: string) {
    super(`Invalid lifecycle transition from ${from} via ${action}: ${reason}`);
    this.name = "LifecycleTransitionError";
    this.fromState = from;
    this.action = action;
  }
}

/**
 * Apply a transition. Throws on invalid transitions rather than silently
 * coercing — this is the §0 data-integrity boundary, not a user-facing rule.
 */
export function reduceLifecycle(current: Lifecycle, action: LifecycleAction): Lifecycle {
  switch (action.type) {
    case "RECORD_INSTANT": {
      if (action.eventKind !== "instant") {
        throw new LifecycleTransitionError(
          current.state,
          action.type,
          `RECORD_INSTANT is instant-only (got kind=${action.eventKind})`,
        );
      }
      if (current.state !== "projected") {
        throw new LifecycleTransitionError(
          current.state,
          action.type,
          "RECORD_INSTANT requires projected state",
        );
      }
      return { state: "completed", committedAt: action.at };
    }

    case "TIME_EDIT": {
      return { state: "completed", committedAt: action.at };
    }

    case "OWNER_EDIT": {
      if (current.state !== "projected") {
        // Owner edits on already-recorded or completed events stay in their current state.
        return current;
      }
      return { state: "recorded", annotatedAt: action.at };
    }

    case "DRAWER_SAVE": {
      const { eventType, eventKind, timeChanged, hasEndTime, nowMinutes } = action;

      // Completed stays frozen.
      if (current.state === "completed") {
        return current;
      }

      if (current.state === "projected") {
        if (!timeChanged) {
          // No time change: owner/amount/label only → annotate as recorded.
          return { state: "recorded", annotatedAt: nowMinutes };
        }
        // Block with no endTime is "started but not done yet" — recorded.
        if (eventKind === "block" && !hasEndTime) {
          return { state: "recorded", annotatedAt: nowMinutes };
        }
        // Scheduling types: drawer time-edits are scheduling intent, not
        // reality. Stay in `recorded` so the engine treats the event as
        // a future projection with an anchored time (preserves hasPutdown).
        if (isSchedulingType(eventType)) {
          return { state: "recorded", annotatedAt: nowMinutes };
        }
        // All other types: time-edit locks in the time.
        return { state: "completed", committedAt: nowMinutes };
      }

      // current.state === "recorded"
      // No time change: field edit only → lifecycle unchanged.
      if (!timeChanged) return current;
      // Re-scheduling a scheduling-type stays recorded.
      if (isSchedulingType(eventType)) {
        return { state: "recorded", annotatedAt: nowMinutes };
      }
      // Other recorded + time-edit: promote to completed.
      return { state: "completed", committedAt: nowMinutes };
    }
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner && pnpm test -- src/v3/lifecycle.test.ts 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner
git add src/v3/lifecycle.ts src/v3/lifecycle.test.ts
git commit -m "refactor(v3): lifecycle reducer — drop START/END, rename overridden→recorded; DRAWER_SAVE recorded path"
```

---

## Task 4: Update evaluator.ts sameLifecycle

**Files:**
- Modify: `src/v3/engine/evaluator.ts`

The `sameLifecycle` function currently has:
```ts
function sameLifecycle(a: Lifecycle, b: Lifecycle): boolean {
  if (a.state !== b.state) return false;
  if (
    (a.state === "started" && b.state === "started") ||
    (a.state === "completed" && b.state === "completed")
  ) {
    return a.committedAt === b.committedAt;
  }
  return true;
}
```

After the schema change, `started` no longer exists. The new `recorded` state uses `annotatedAt`. `completed` still uses `committedAt`.

Also, the evaluator.ts comment at the top says `lifecycle.state is 'started' or 'completed'` in the reality-wins description — update this.

- [ ] **Step 1: Update `sameLifecycle` in `src/v3/engine/evaluator.ts`**

Find and replace the `sameLifecycle` function:

```ts
function sameLifecycle(a: Lifecycle, b: Lifecycle): boolean {
  if (a.state !== b.state) return false;
  if (a.state === "completed" && b.state === "completed") {
    return a.committedAt === b.committedAt;
  }
  if (a.state === "recorded" && b.state === "recorded") {
    return a.annotatedAt === b.annotatedAt;
  }
  return true;
}
```

Also update the top-of-file comment line 17:
```
// The reality-wins axiom (§2.0):
//   No rule may add, remove, or mutate any event whose lifecycle.state is
//   `recorded` or `completed`. The safeProduces wrapper enforces this by
//   diffing recorded events before/after each rule run.
```

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner && pnpm typecheck 2>&1 | head -40
```

- [ ] **Step 3: Run evaluator tests**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner && pnpm test -- src/v3/engine/evaluator.test.ts 2>&1 | tail -15
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner
git add src/v3/engine/evaluator.ts
git commit -m "refactor(v3): evaluator sameLifecycle — drop started, handle recorded annotatedAt"
```

---

## Task 5: Update putdown.ts R6.1 predicate

**Files:**
- Modify: `src/v3/engine/rules/putdown.ts`

The `deriveHasPutdown` function currently checks:
```ts
return state === "projected" || state === "overridden";
```

This should become:
```ts
return state === "projected" || state === "recorded";
```

The reasoning is identical: `recorded` (formerly `overridden`) means the user has annotated times but not fully completed the block — the putdown window is still meaningful.

- [ ] **Step 1: Update `deriveHasPutdown` in `src/v3/engine/rules/putdown.ts`**

Find the line:
```ts
  return state === "projected" || state === "overridden";
```

Replace with:
```ts
  return state === "projected" || state === "recorded";
```

Also update the JSDoc comments: replace `overridden` with `recorded` in the rule description and the inline comments explaining why `overridden` is included and why `started`/`completed` are excluded.

The updated function and surrounding comments in `putdown.ts`:

```ts
/**
 * R6.x — Putdown rules (render-only flag).
 *
 * Source: docs/v3/ENGINE_SPEC.md §6.
 *
 * R6.1: putdown is purely predictive — never recorded, never persisted.
 * The engine sets `hasPutdown: true` on naps and bedtimes whose lifecycle
 * still points to a future moment (`projected` or `recorded`). The
 * renderer (`expandPutdownBlocks`) further gates by `nowMinutes` — R6.7
 * suppresses the synthetic when the moment has passed in real time.
 *
 * Why both `projected` AND `recorded`: a user-anchored nap (e.g. drawer
 * time-edit, owner annotation) has `lifecycle.state === "recorded"` but
 * the putdown window may still be in the future. The putdown is still
 * relevant.
 *
 * Why NOT `completed`: completed naps represent past reality. On an
 * archived-day read (renderer's `nowMinutes` unavailable), the renderer
 * would otherwise inject phantom putdown visuals around historical events.
 *
 * R6.2: derived from the parent event; no separate Firestore doc.
 */

import type { Event } from "../../schemas";
import type { Rule } from "../evaluator";

const RuleSetHasPutdown: Rule = {
  id: "R6.1",
  description:
    "Set hasPutdown=true on naps/bedtimes whose lifecycle still points to a future moment",
  matches: (events) => events.some((e) => deriveHasPutdown(e) !== e.hasPutdown),
  produces: (events) =>
    events.map((e) => {
      const target = deriveHasPutdown(e);
      if (target === e.hasPutdown) return e;
      return { ...e, hasPutdown: target };
    }),
};

function deriveHasPutdown(e: Event): boolean {
  if (e.type !== "nap" && e.type !== "bedtime") return false;
  const state = e.lifecycle.state;
  return state === "projected" || state === "recorded";
}

export const RULES: Rule[] = [RuleSetHasPutdown];
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner && pnpm test -- src/v3/engine/rules 2>&1 | tail -15
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner
git add src/v3/engine/rules/putdown.ts
git commit -m "refactor(v3): putdown R6.1 — overridden→recorded in hasPutdown predicate"
```

---

## Task 6: Update naps.ts — cursor advancement + rename

**Files:**
- Modify: `src/v3/engine/rules/naps.ts`

Two changes in `naps.ts`:

1. Line 144: `cursor = existingNap.endTime ?? existingNap.startTime + napLen;`
   → Use `effectiveEndOf(existingNap, napLen, ctx.nowMinutes)` from the new utility.

2. Comments and docstrings referencing `recorded/overridden` → `recorded/recorded` (they already had `recorded/overridden` meaning "any non-projected state").

The key edit is in `projectSleepCascade`. After the `if (existingNap)` block:
```ts
    if (existingNap) {
      // Cursor advances from reality's endTime.
      cursor = existingNap.endTime ?? existingNap.startTime + napLen;
    }
```

Becomes:
```ts
    if (existingNap) {
      // Cursor advances from the effective end: for in-progress recorded naps
      // this auto-extends until the nap actually ends (capped at 3 extensions).
      cursor = effectiveEndOf(existingNap, napLen, ctx.nowMinutes);
    }
```

Also update the top-of-file comment: `recorded/overridden naps anchor their slot` → `recorded/completed naps anchor their slot`. And update the `matches` comment which mentions `'overridden'`.

- [ ] **Step 1: Add `effectiveEndOf` import to `naps.ts`**

At the top of `src/v3/engine/rules/naps.ts`, add the import:
```ts
import { effectiveEndOf } from "../../lib/effectiveEnd";
```

- [ ] **Step 2: Update cursor advancement**

In `src/v3/engine/rules/naps.ts`, find:
```ts
    if (existingNap) {
      // Cursor advances from reality's endTime.
      cursor = existingNap.endTime ?? existingNap.startTime + napLen;
    }
```

Replace with:
```ts
    if (existingNap) {
      // Cursor advances from the effective end. For in-progress recorded naps
      // (lifecycle.state === "recorded") this auto-extends past the placeholder
      // endTime using effectiveEndOf until the nap is closed — cap at 3
      // extensions (= startTime + 4×napLen). Completed naps and projected naps
      // pass through their actual endTime.
      cursor = effectiveEndOf(existingNap, napLen, ctx.nowMinutes);
    }
```

- [ ] **Step 3: Update comments in naps.ts**

Update the top comment block that says:
```
 *   - recorded/overridden naps anchor their slot (their startTime/endTime
 *     drive the cascade past them)
 *   - a recorded/overridden bedtime in `actuals` short-circuits the
 *     cascade at its startTime (no further nap/WW emitted past it)
```

To:
```
 *   - recorded/completed naps anchor their slot (their startTime/endTime
 *     drive the cascade past them)
 *   - a recorded/completed bedtime in `actuals` short-circuits the
 *     cascade at its startTime (no further nap/WW emitted past it)
```

Update the `matches` comment that mentions `'overridden'`:
```
  // User-tapped overrides (lifecycle.state: 'overridden') sit in
  // ctx.actuals as metadata carriers
```
To:
```
  // User-annotated events (lifecycle.state: 'recorded') sit in
  // ctx.actuals as metadata carriers
```

- [ ] **Step 4: Run naps tests**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner && pnpm test -- src/v3/engine/rules/naps.test.ts 2>&1 | tail -20
```

Expected: existing tests pass. Some may reference `overridden` in factories — they will be updated in Task 8.

- [ ] **Step 5: Commit**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner
git add src/v3/engine/rules/naps.ts
git commit -m "refactor(v3): naps cascade — effectiveEndOf for cursor advancement; rename overridden refs"
```

---

## Task 7: Update expandPutdown.ts — time-based in-progress detection

**Files:**
- Modify: `src/v3/components/Timeline/expandPutdown.ts`
- Modify: `src/v3/components/Timeline/expandPutdown.test.ts`

The current `isInProgressSleep` checks `lifecycle.state === "started"`. Under the new model, it should be time-based: `lifecycle.state === "recorded"` AND `startTime <= now AND now < effectiveEnd`.

Similarly, `windowOverlapsInProgressSleep` uses `s.endTime ?? s.startTime + defaultNapLengthMinutes` which was the fallback for `started` naps with no `endTime`. Under the new model, recorded naps always have an `endTime` (set by NapActionButton in Task 9), but `effectiveEndOf` handles the auto-extension case properly.

The `nowMinutes` option needs to be passed to `isInProgressSleep` and `windowOverlapsInProgressSleep`. Currently `nowMinutes` is only on `ExpandPutdownOptions`. Thread it through.

- [ ] **Step 1: Update the test file first**

In `src/v3/components/Timeline/expandPutdown.test.ts`:

1. Find all `lifecycle: { state: "started", committedAt: ... }` references and change to `lifecycle: { state: "recorded", annotatedAt: ... }`.

2. Add a new test for auto-extend cap in R6.8:

```ts
    it("suppresses putdown when in-progress nap extends past its endTime (auto-extend)", () => {
      // nap_1: started at 9:00, endTime 10:00 (placeholder).
      // now = 10:30 → effectiveEnd = 11:00 (1 extension of 60 min).
      // nap_2 projected at 10:45 → putdown window [10:30, 10:45].
      // [10:30, 10:45] overlaps [9:00, 11:00] → suppress.
      const napLen = 60;
      const startedNap1: Event = {
        id: "nap-1",
        dayId: "d-1",
        eventKey: "nap_1",
        type: "nap",
        kind: "block",
        startTime: 9 * 60,
        endTime: 10 * 60,
        label: "Nap 1",
        hasPutdown: false,
        lifecycle: { state: "recorded", annotatedAt: 9 * 60 },
      };
      const projNap2 = ev({
        id: "nap-2",
        eventKey: "nap_2",
        startTime: 10 * 60 + 45,
        endTime: 11 * 60 + 45,
        hasPutdown: true,
        lifecycle: { state: "projected" },
      });
      const out = expandPutdownBlocks([startedNap1, projNap2], {
        putdownLeadMinutes: 15,
        defaultNapLengthMinutes: napLen,
        nowMinutes: 10 * 60 + 30, // 30 min past nap_1.endTime
      });
      // putdown window = [10:30, 10:45] overlaps effectiveEnd range [9:00, 11:00]
      expect(out.find((e) => e.id === "putdown:nap-2")).toBeUndefined();
    });
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner && pnpm test -- src/v3/components/Timeline/expandPutdown.test.ts 2>&1 | tail -20
```

Expected: failures on `started` references and the new auto-extend test.

- [ ] **Step 3: Rewrite `expandPutdown.ts`**

Replace `src/v3/components/Timeline/expandPutdown.ts`:

```ts
/**
 * Putdown is a render-only flag in V3 (R6.1). The engine never emits a
 * putdown event; parent events (nap / bedtime) carry `hasPutdown: true`
 * and the renderer prepends a synthetic block.
 *
 * The synthetic events stay inside the renderer. They share a marker
 * `eventKey` so block geometry / styling can branch on "is this a
 * putdown" without sniffing types.
 */

import type { Event, EventType, TimeMin } from "../../schemas";
import { effectiveEndOf } from "../../lib/effectiveEnd";

export const PUTDOWN_KIND_TAG = "__putdown__";

export type ExpandPutdownOptions = {
  putdownLeadMinutes: TimeMin;
  /**
   * Default nap length in minutes. Used by the R6.8 in-progress overlap
   * check to compute effectiveEndOf for recorded naps.
   */
  defaultNapLengthMinutes: number;
  /**
   * Wall-clock TimeMin. Undefined means "no clock provided, render
   * every hasPutdown event" — the read-only archived-day path.
   */
  nowMinutes?: TimeMin;
};

export function expandPutdownBlocks(events: Event[], options: ExpandPutdownOptions): Event[] {
  const { putdownLeadMinutes, defaultNapLengthMinutes, nowMinutes } = options;
  const now = nowMinutes;
  // In-progress sleeps are identified time-based (not by `started` state).
  const inProgressSleeps = now !== undefined ? events.filter((e) => isInProgressSleep(e, defaultNapLengthMinutes, now)) : [];
  const out: Event[] = [];
  for (const e of events) {
    out.push(e);
    if (
      e.hasPutdown &&
      isStillFuture(e, now) &&
      !windowOverlapsInProgressSleep(
        inProgressSleeps,
        e.startTime - putdownLeadMinutes,
        e.startTime,
        defaultNapLengthMinutes,
        now ?? 0,
      )
    ) {
      out.push(syntheticPutdown(e, putdownLeadMinutes));
    }
  }
  return out;
}

// R6.7 — suppress the synthetic putdown when the parent's moment has
// passed. `nowMinutes` undefined means "no clock provided, render every
// hasPutdown event" — that's the read-only archived-day path.
function isStillFuture(parent: Event, nowMinutes: TimeMin | undefined): boolean {
  if (nowMinutes === undefined) return true;
  return parent.startTime > nowMinutes;
}

// R6.8 — suppress a putdown chip whose window overlaps any in-progress
// sleep block. "In progress" is a time property: lifecycle.state === "recorded"
// AND startTime <= now AND now < effectiveEnd.
function isInProgressSleep(e: Event, napLen: number, now: TimeMin): boolean {
  if (e.type !== "nap" && e.type !== "bedtime") return false;
  if (e.lifecycle.state !== "recorded") return false;
  if (e.startTime > now) return false;
  return now < effectiveEndOf(e, napLen, now);
}

function windowOverlapsInProgressSleep(
  inProgressSleeps: Event[],
  windowStart: TimeMin,
  windowEnd: TimeMin,
  napLen: number,
  now: TimeMin,
): boolean {
  return inProgressSleeps.some((s) => {
    const sStart = s.startTime;
    const sEnd = effectiveEndOf(s, napLen, now);
    return windowStart < sEnd && windowEnd > sStart;
  });
}

function syntheticPutdown(parent: Event, lead: TimeMin): Event {
  // Use the parent's type so block geometry rules can stay typed; the
  // PUTDOWN_KIND_TAG eventKey is what the timeline branches on for
  // putdown-specific rendering.
  const type: EventType = parent.type;
  const synthetic: Event = {
    id: `putdown:${parent.id}`,
    dayId: parent.dayId,
    eventKey: PUTDOWN_KIND_TAG,
    type,
    kind: "block",
    startTime: parent.startTime - lead,
    endTime: parent.startTime,
    label: "Putdown",
    hasPutdown: false,
    lifecycle: parent.lifecycle,
    ...(parent.owner !== undefined ? { owner: parent.owner } : {}),
  };
  return synthetic;
}
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner && pnpm test -- src/v3/components/Timeline/expandPutdown.test.ts 2>&1 | tail -15
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner
git add src/v3/components/Timeline/expandPutdown.ts src/v3/components/Timeline/expandPutdown.test.ts
git commit -m "refactor(v3): expandPutdown — time-based in-progress detection; effectiveEndOf for R6.8 overlap"
```

---

## Task 8: Update factories.ts and naps.test.ts

**Files:**
- Modify: `src/v3/__tests__/factories.ts`
- Modify: `src/v3/engine/rules/naps.test.ts`

The `aRecordedNap` factory uses `{ state: "completed", committedAt }` as default — this is fine (completed means fully recorded). However, the test in `naps.test.ts` at line 174-178 uses `{ state: "overridden", annotatedAt }` which no longer exists. It needs `{ state: "recorded", annotatedAt }`.

- [ ] **Step 1: Find all `overridden` / `started` references in test files**

```bash
grep -rn "overridden\|\"started\"" /Users/jakemosher/Workspace/baby-day-planner/src --include="*.test.*" 2>&1
```

- [ ] **Step 2: Update `naps.test.ts`**

In `src/v3/engine/rules/naps.test.ts`, find the test around line 174 that creates an `overriddenNap2` with `lifecycle: { state: "overridden", annotatedAt: 13 * 60 }`. Change to `{ state: "recorded", annotatedAt: 13 * 60 }`. The test verifies that a user-annotated nap anchors the cascade — this semantic is unchanged.

Also add a new test at the end of the naps test file for auto-extend cascade interaction:

```ts
describe("auto-extend: effectiveEndOf feeds cascade cursor for in-progress recorded naps", () => {
  it("cascade cursor advances past placeholder endTime when now exceeds it", () => {
    // nap_1: recorded at 9:00, placeholder endTime 10:00 (napLen = 60).
    // now = 10:30 → effectiveEnd = 11:00 (1 extension).
    // ww_2 should start at 11:00 (effectiveEnd), not 10:00 (endTime).
    const napLen = 60;
    const wakeTime = 7 * 60;
    const settings = aSettings({
      defaultNapLengthMinutes: napLen,
      wakeWindowsMinutes: [120, 90],
    });
    const recordedNap1: import("../../schemas").Event = {
      id: "nap_1",
      dayId: "day_test",
      eventKey: "nap_1",
      type: "nap",
      kind: "block",
      label: "Nap 1",
      startTime: 9 * 60,
      endTime: 10 * 60, // placeholder
      hasPutdown: false,
      lifecycle: { state: "recorded", annotatedAt: 9 * 60 },
    };

    const out = projectDay(
      {
        day: aDay({ wakeTime }),
        settings,
        actuals: [recordedNap1],
        nowMinutes: 10 * 60 + 30, // 30 min past placeholder endTime
      },
      { rules: NAP_RULES },
    );

    const ww2 = out.find((e) => e.eventKey === "wake_window_2");
    // ww_2 should start at 11:00 (effectiveEnd), not 10:00 (endTime).
    expect(ww2?.startTime).toBe(11 * 60);
  });
});
```

- [ ] **Step 3: Run the tests**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner && pnpm test -- src/v3/engine/rules/naps.test.ts 2>&1 | tail -20
```

Expected: all pass including the new auto-extend test.

- [ ] **Step 4: Commit**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner
git add src/v3/__tests__/factories.ts src/v3/engine/rules/naps.test.ts
git commit -m "test(v3): naps — rename overridden→recorded in test fixtures; add auto-extend cascade test"
```

---

## Task 9: Update NapActionButton.tsx — set endTime on start

**Files:**
- Modify: `src/v3/components/Dashboard/NapActionButton.tsx`
- Modify: `src/v3/components/Dashboard/NapActionButton.test.tsx`

The key change: "Start Nap Now" sets `endTime = nowMin + defaultNapLengthMinutes` and `lifecycle = { state: "recorded", annotatedAt: nowMin }`. "Start Bedtime Now" sets `endTime = nextDayAt(defaultWakeTime)` and same lifecycle.

Both `defaultNapLengthMinutes` and `defaultWakeTime` need to be available. Add them as props.

- [ ] **Step 1: Update the tests first**

Replace `src/v3/components/Dashboard/NapActionButton.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Event } from "@/v3/schemas";
import { NapActionButton } from "./NapActionButton";

const DEFAULT_NAP_MINUTES = 90;
const DEFAULT_WAKE_TIME = 7 * 60; // 7:00 AM

const napInProgress = (): Event => ({
  id: "nap_1",
  dayId: "d1",
  eventKey: "nap_1",
  type: "nap",
  kind: "block",
  label: "Nap 1",
  startTime: 9 * 60,
  endTime: 9 * 60 + DEFAULT_NAP_MINUTES,
  hasPutdown: false,
  lifecycle: { state: "recorded", annotatedAt: 9 * 60 },
});

const projectedNap = (n: number): Event => ({
  id: `proj_nap_${n}`,
  dayId: "d1",
  eventKey: `nap_${n}`,
  type: "nap",
  kind: "block",
  label: `Nap ${n}`,
  startTime: 9 * 60,
  hasPutdown: false,
  lifecycle: { state: "projected" },
});

const PRE_THRESHOLD = 10 * 60; // 10:00 AM
const POST_THRESHOLD = 19 * 60 + 30; // 7:30 PM
const THRESHOLD = 19 * 60; // 7:00 PM

describe("NapActionButton", () => {
  it("renders 'Start Nap Now' before threshold when no nap is in progress", () => {
    render(
      <NapActionButton
        inProgressNap={undefined}
        dayId="d1"
        nextProjectedNap={projectedNap(1)}
        nowMinutes={PRE_THRESHOLD}
        bedtimeThreshold={THRESHOLD}
        defaultNapLengthMinutes={DEFAULT_NAP_MINUTES}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onStart={async () => {}}
        onEnd={async () => {}}
        onStartBedtime={async () => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /start nap now/i })).toBeVisible();
  });

  it("renders 'End Nap' when a nap is in progress (regardless of threshold)", () => {
    render(
      <NapActionButton
        inProgressNap={napInProgress()}
        dayId="d1"
        nextProjectedNap={undefined}
        nowMinutes={POST_THRESHOLD}
        bedtimeThreshold={THRESHOLD}
        defaultNapLengthMinutes={DEFAULT_NAP_MINUTES}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onStart={async () => {}}
        onEnd={async () => {}}
        onStartBedtime={async () => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /end nap/i })).toBeVisible();
  });

  it("promotes nextProjectedNap on Start Nap — lifecycle recorded with endTime set", async () => {
    const onStart = vi.fn().mockResolvedValue(undefined);
    render(
      <NapActionButton
        inProgressNap={undefined}
        dayId="d1"
        nextProjectedNap={projectedNap(2)}
        nowMinutes={PRE_THRESHOLD}
        bedtimeThreshold={THRESHOLD}
        defaultNapLengthMinutes={DEFAULT_NAP_MINUTES}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onStart={onStart}
        onEnd={async () => {}}
        onStartBedtime={async () => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onStart).toHaveBeenCalledTimes(1);
    const arg = onStart.mock.calls[0]?.[0] as Event;
    expect(arg).toMatchObject({
      id: "nap_2",
      type: "nap",
      kind: "block",
      eventKey: "nap_2",
      label: "Nap 2",
      dayId: "d1",
      hasPutdown: false,
    });
    // endTime must be set (not undefined) — this was the image bug
    expect(arg.endTime).toBeDefined();
    expect(typeof arg.endTime).toBe("number");
    // lifecycle must be recorded (not started)
    expect(arg.lifecycle.state).toBe("recorded");
    // endTime should be startTime + defaultNapLengthMinutes
    expect(arg.endTime).toBe(arg.startTime + DEFAULT_NAP_MINUTES);
  });

  it("calls onEnd with the in-progress nap and current TimeMin endTime", async () => {
    const onEnd = vi.fn().mockResolvedValue(undefined);
    const nap = napInProgress();
    render(
      <NapActionButton
        inProgressNap={nap}
        dayId="d1"
        nextProjectedNap={undefined}
        nowMinutes={PRE_THRESHOLD}
        bedtimeThreshold={THRESHOLD}
        defaultNapLengthMinutes={DEFAULT_NAP_MINUTES}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onStart={async () => {}}
        onEnd={onEnd}
        onStartBedtime={async () => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onEnd).toHaveBeenCalledTimes(1);
    const [calledNap, endTime] = onEnd.mock.calls[0] ?? [];
    expect(calledNap).toEqual(nap);
    expect(typeof endTime).toBe("number");
    expect(endTime).toBeGreaterThanOrEqual(0);
    expect(endTime).toBeLessThan(24 * 60);
  });
});

describe("NapActionButton — CTA swap past bedtime threshold (§F8)", () => {
  it("renders 'Start Bedtime Now' when nowMinutes ≥ bedtimeThreshold", () => {
    render(
      <NapActionButton
        inProgressNap={undefined}
        dayId="d1"
        nextProjectedNap={undefined}
        nowMinutes={POST_THRESHOLD}
        bedtimeThreshold={THRESHOLD}
        defaultNapLengthMinutes={DEFAULT_NAP_MINUTES}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onStart={async () => {}}
        onEnd={async () => {}}
        onStartBedtime={async () => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /start bedtime now/i })).toBeVisible();
  });

  it("calls onStartBedtime with a bedtime event with endTime set when tapped past threshold", async () => {
    const onStartBedtime = vi.fn().mockResolvedValue(undefined);
    render(
      <NapActionButton
        inProgressNap={undefined}
        dayId="d1"
        nextProjectedNap={undefined}
        nowMinutes={POST_THRESHOLD}
        bedtimeThreshold={THRESHOLD}
        defaultNapLengthMinutes={DEFAULT_NAP_MINUTES}
        defaultWakeTime={DEFAULT_WAKE_TIME}
        onStart={async () => {}}
        onEnd={async () => {}}
        onStartBedtime={onStartBedtime}
      />,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onStartBedtime).toHaveBeenCalledTimes(1);
    const arg = onStartBedtime.mock.calls[0]?.[0] as Event;
    expect(arg).toMatchObject({
      id: "bedtime",
      type: "bedtime",
      kind: "block",
      eventKey: "bedtime",
      label: "Bedtime",
      dayId: "d1",
    });
    // endTime must be set for bedtime (nextDayAt(defaultWakeTime) = 7:00 + 1440 = 1860)
    expect(arg.endTime).toBe(DEFAULT_WAKE_TIME + 24 * 60);
    expect(arg.lifecycle.state).toBe("recorded");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner && pnpm test -- src/v3/components/Dashboard/NapActionButton.test.tsx 2>&1 | tail -20
```

Expected: failures on `started` state and missing `endTime`.

- [ ] **Step 3: Rewrite NapActionButton.tsx**

Replace `src/v3/components/Dashboard/NapActionButton.tsx`:

```tsx
"use client";

import type { Event, TimeMin } from "@/v3/schemas";
import { currentLocalMinutes } from "@/v3/ui/time";
import { nextDayAt } from "@/v3/ui/time";
import { ActionButton } from "./ActionButton";

export type NapActionButtonProps = {
  inProgressNap: Event | undefined;
  dayId: string;
  /**
   * The next-upcoming projected nap, if any. Start Nap promotes that
   * projection (uses its eventKey + label) so the cascade keys off
   * the same `nap_N` slot.
   */
  nextProjectedNap?: Event | undefined;
  /** Current wall-clock TimeMin (used for the CTA swap decision). */
  nowMinutes: TimeMin;
  /** Settings.bedtimeThreshold — drives the CTA swap. */
  bedtimeThreshold: TimeMin;
  /** Settings.defaultNapLengthMinutes — used to set the placeholder endTime. */
  defaultNapLengthMinutes: number;
  /** Settings.defaultWakeTime — used to set bedtime's endTime. */
  defaultWakeTime: TimeMin;
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
  defaultNapLengthMinutes,
  defaultWakeTime,
  onStart,
  onEnd,
  onStartBedtime,
}: NapActionButtonProps) {
  const pastThreshold = nowMinutes >= bedtimeThreshold;

  const handleClick = () => {
    const nowMin = currentLocalMinutes();
    if (inProgressNap) {
      void onEnd(inProgressNap, nowMin);
      return;
    }

    // Past threshold → start bedtime instead. The dashboard primary
    // CTA stays always-actionable; physiology takes over from rhythm
    // once it's bedtime o'clock (DOMAIN.md §3).
    if (pastThreshold) {
      const bedtime: Event = {
        id: "bedtime",
        dayId,
        eventKey: "bedtime",
        type: "bedtime",
        kind: "block",
        label: "Bedtime",
        startTime: nowMin,
        endTime: nextDayAt(defaultWakeTime),
        hasPutdown: false,
        lifecycle: { state: "recorded", annotatedAt: nowMin },
      };
      void onStartBedtime(bedtime);
      return;
    }

    // Standard path: promote nextProjectedNap. Under the physiology
    // cascade nextProjectedNap is always defined within-day; if a
    // caller invokes this without one (e.g. settings misconfigured),
    // bail safely rather than minting a UUID nap.
    if (!nextProjectedNap) return;
    const nap: Event = {
      id: nextProjectedNap.eventKey,
      dayId,
      eventKey: nextProjectedNap.eventKey,
      type: "nap",
      kind: "block",
      label: nextProjectedNap.label,
      startTime: nowMin,
      endTime: nowMin + defaultNapLengthMinutes,
      hasPutdown: false,
      lifecycle: { state: "recorded", annotatedAt: nowMin },
    };
    void onStart(nap);
  };

  const label = inProgressNap ? "End Nap" : pastThreshold ? "Start Bedtime Now" : "Start Nap Now";

  return (
    <ActionButton variant="secondary" onClick={handleClick}>
      {label}
    </ActionButton>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner && pnpm test -- src/v3/components/Dashboard/NapActionButton.test.tsx 2>&1 | tail -15
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner
git add src/v3/components/Dashboard/NapActionButton.tsx src/v3/components/Dashboard/NapActionButton.test.tsx
git commit -m "feat(v3): NapActionButton — set endTime on start; lifecycle recorded not started; add defaultNapLengthMinutes/defaultWakeTime props"
```

---

## Task 10: Update page.tsx — handleEndNap + inProgressNap + props

**Files:**
- Modify: `src/app/(authed)/page.tsx`

Three changes:
1. `handleEndNap`: use `TIME_EDIT` action instead of `END`.
2. `inProgressNap` selector: time-based with `effectiveEndOf`.
3. Pass `defaultNapLengthMinutes` and `defaultWakeTime` to `NapActionButton`.

- [ ] **Step 1: Update `handleEndNap`**

Find in `src/app/(authed)/page.tsx`:
```ts
  const handleEndNap = async (nap: Event, endTime: number) => {
    if (!day || day.id === "") return;
    // committedAt on a completed nap = the START time (preserved from the
    // `started` lifecycle), NOT the end time. reduceLifecycle handles this
    // — END copies committedAt forward from the started state.
    await saveEvent({
      ...nap,
      endTime,
      lifecycle: reduceLifecycle(nap.lifecycle, { type: "END", at: endTime }),
    });
  };
```

Replace with:
```ts
  const handleEndNap = async (nap: Event, endTime: number) => {
    if (!day || day.id === "") return;
    // TIME_EDIT on a recorded nap → completed. committedAt is the
    // moment the user confirmed the end time.
    await saveEvent({
      ...nap,
      endTime,
      lifecycle: reduceLifecycle(nap.lifecycle, { type: "TIME_EDIT", at: endTime }),
    });
  };
```

- [ ] **Step 2: Update `inProgressNap` selector**

Find:
```ts
  const inProgressNap = actuals.find((e) => e.type === "nap" && e.lifecycle.state === "started");
```

Replace with:
```ts
  const inProgressNap = actuals.find(
    (e) =>
      e.type === "nap" &&
      e.lifecycle.state === "recorded" &&
      e.startTime <= nowMinutes &&
      nowMinutes < effectiveEndOf(e, settings.defaultNapLengthMinutes, nowMinutes),
  );
```

Add the import for `effectiveEndOf` at the top of the file:
```ts
import { effectiveEndOf } from "@/v3/lib/effectiveEnd";
```

- [ ] **Step 3: Pass new props to NapActionButton**

Find the `NapActionButton` JSX:
```tsx
        <NapActionButton
          inProgressNap={inProgressNap}
          dayId={day.id}
          nowMinutes={nowMinutes}
          bedtimeThreshold={settings.bedtimeThreshold}
          {...(nn ? { nextProjectedNap: nn } : {})}
          onStart={handleStartNap}
          onEnd={handleEndNap}
          onStartBedtime={handleStartBedtime}
        />
```

Replace with:
```tsx
        <NapActionButton
          inProgressNap={inProgressNap}
          dayId={day.id}
          nowMinutes={nowMinutes}
          bedtimeThreshold={settings.bedtimeThreshold}
          defaultNapLengthMinutes={settings.defaultNapLengthMinutes}
          defaultWakeTime={settings.defaultWakeTime}
          {...(nn ? { nextProjectedNap: nn } : {})}
          onStart={handleStartNap}
          onEnd={handleEndNap}
          onStartBedtime={handleStartBedtime}
        />
```

- [ ] **Step 4: Typecheck and run tests**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner && pnpm typecheck 2>&1 | tail -10
cd /Users/jakemosher/Workspace/baby-day-planner && pnpm test 2>&1 | tail -15
```

Expected: typecheck clean, tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner
git add src/app/(authed)/page.tsx
git commit -m "refactor(v3): page.tsx — TIME_EDIT for handleEndNap; time-based inProgressNap selector; NapActionButton new props"
```

---

## Task 11: Update startNapThenRender.test.ts seam test

**Files:**
- Modify: `src/v3/__tests__/startNapThenRender.test.ts`

The existing seam test uses `lifecycle: { state: "started", committedAt: startTime }` in the `startedNapSlot` factory. Update to `recorded`.

Also add the cap test as specified in the plan.

- [ ] **Step 1: Update `startNapThenRender.test.ts`**

Replace the `startedNapSlot` function:
```ts
function startedNapSlot(n: number, startTime: number): Event {
  const key = `nap_${n}`;
  return {
    id: key,
    dayId: "day_test",
    eventKey: key,
    type: "nap",
    kind: "block",
    label: `Nap ${n}`,
    startTime,
    endTime: startTime + 90, // placeholder endTime (90 min default)
    hasPutdown: false,
    lifecycle: { state: "recorded", annotatedAt: startTime },
  };
}
```

Note: the existing test uses `defaultNapLengthMinutes: 60` in settings. Update `endTime` in `startedNapSlot` to use the settings value by passing it as a parameter:

```ts
function recordedNapSlot(n: number, startTime: number, napLen: number): Event {
  const key = `nap_${n}`;
  return {
    id: key,
    dayId: "day_test",
    eventKey: key,
    type: "nap",
    kind: "block",
    label: `Nap ${n}`,
    startTime,
    endTime: startTime + napLen,
    hasPutdown: false,
    lifecycle: { state: "recorded", annotatedAt: startTime },
  };
}
```

Update both test calls to use the new function name with napLen parameter.

Add a cap test at the bottom:

```ts
  it("effectiveEnd caps at startTime + 4×napLen when nap runs very long", () => {
    const wakeTime = 7 * 60;
    const napLen = 60;
    // nap_1 started at 9:00, endTime = 10:00.
    // now = 14:00 (5 hours later, well past 3 extensions).
    // cap = 9:00 + 4*60 = 13:00.
    const nap1 = recordedNapSlot(1, 9 * 60, napLen);

    const settings = aSettings({
      defaultNapLengthMinutes: napLen,
      putdownLeadMinutes: 15,
      wakeWindowsMinutes: [120, 135],
      bedtimeThreshold: 19 * 60,
      defaultWakeTime: wakeTime,
    });
    const day = aDay({ wakeTime });
    const ctx = aContext({
      day,
      settings,
      actuals: [nap1],
      nowMinutes: 14 * 60, // far past cap
    });

    const projected = projectDay({
      day: ctx.day,
      settings: ctx.settings,
      actuals: ctx.actuals,
      nowMinutes: ctx.nowMinutes,
    });

    // ww_2 should start at cap = 13:00 (startTime + 4×napLen).
    const ww2 = projected.find((e) => e.eventKey === "wake_window_2");
    expect(ww2?.startTime).toBe(9 * 60 + 4 * napLen); // 13:00
  });
```

- [ ] **Step 2: Run the seam tests**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner && pnpm test -- src/v3/__tests__/startNapThenRender.test.ts 2>&1 | tail -15
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner
git add src/v3/__tests__/startNapThenRender.test.ts
git commit -m "test(v3): startNapThenRender — update to recorded lifecycle; add cap test"
```

---

## Task 12: Full test suite + typecheck + lint + format

Run the full verification pass and fix any remaining failures.

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner && pnpm test 2>&1 | tail -20
```

Fix any failures. Common sources:
- Remaining `started`/`overridden` references in test files not yet updated
- Any file importing `START` or `END` from lifecycle actions
- Any test asserting `lifecycle.state === "started"`

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner && pnpm typecheck 2>&1 | tail -10
```

Fix all type errors.

- [ ] **Step 3: Run lint**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner && pnpm lint 2>&1 | tail -10
```

Fix any lint errors.

- [ ] **Step 4: Run format check**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner && pnpm format:check 2>&1 | tail -5
```

If format fails:
```bash
cd /Users/jakemosher/Workspace/baby-day-planner && pnpm format
```

Then re-run `pnpm format:check` to confirm clean.

- [ ] **Step 5: Commit any format fixes**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner
git add -A
git commit -m "style: format fixes from lifecycle rename"
```

---

## Task 13: Update docs

**Files:**
- Modify: `docs/v3/DATA_MODEL.md`
- Modify: `docs/v3/ENGINE_SPEC.md`

- [ ] **Step 1: Update DATA_MODEL.md lifecycle section**

Find the lifecycle states section (§2) in `docs/v3/DATA_MODEL.md`. Update all references to `started` → removed and `overridden` → `recorded`. The new state definitions:

```
- `projected`: Engine output. Never persisted. User hasn't touched.
- `recorded`: User has anchored at least one timestamp. The event is real.
              For in-progress naps/bedtimes, the placeholder endTime may
              auto-extend (effectiveEndOf). Both "owner-only annotation" and
              "Start Nap Now" produce this state.
- `completed`: User has anchored both start AND end timestamps. Fully locked.
```

- [ ] **Step 2: Update ENGINE_SPEC.md**

Search for `overridden` and `started` in `docs/v3/ENGINE_SPEC.md`. Update text descriptions. Key places:
- R3.3 mentions "recorded/overridden naps" — update to "recorded/completed naps"
- Any rule referencing `started` state
- The cascade description referencing `overridden bedtime`

- [ ] **Step 3: Commit**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner
git add docs/v3/DATA_MODEL.md docs/v3/ENGINE_SPEC.md
git commit -m "docs(v3): lifecycle state definitions — drop started, rename overridden→recorded"
```

---

## Task 14: Final PR

- [ ] **Step 1: Final full verification**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner && pnpm test 2>&1 | tail -10 && pnpm typecheck 2>&1 | tail -5 && pnpm lint 2>&1 | tail -5 && pnpm format:check 2>&1 | tail -3
```

All must be clean before opening the PR.

- [ ] **Step 2: Push**

```bash
cd /Users/jakemosher/Workspace/baby-day-planner && git push -u origin refactor/v3-lifecycle-recorded-no-started
```

- [ ] **Step 3: Open PR**

```bash
gh pr create \
  --title "refactor(v3): drop \`started\`, rename \`overridden→recorded\`, auto-extend in-progress naps" \
  --body "$(cat <<'EOF'
## What this does

Per Jake's lifecycle simplification (2026-05-16):

- **Drop `started` state** — "in progress" is a TIME property (startTime ≤ now ≤ effectiveEnd), not a lifecycle property. The state was dead weight.
- **Rename `overridden → recorded`** — reality is *recorded*, not overridden. The old name was semantically wrong.
- **New lifecycle union: `{ projected | recorded | completed }`**
- **Auto-extend in-progress naps** — new `effectiveEndOf(event, napLen, now)` utility. Extends past placeholder endTime by one napLen per extension window, capped at 3 extensions (= startTime + 4×napLen). Cascade cursor, putdown R6.8 gate, and inProgressNap selector all use this.

**Fixes the image bug from 2026-05-16 (PR #165 baseline):** after Start Nap Now, the rendered nap clipped at the now line because NapActionButton minted a nap with `endTime: undefined`. Now NapActionButton always sets `endTime = nowMin + defaultNapLengthMinutes`. Cascade and renderer agree.

### Model shift

`started` was wrong because it forced a state machine distinction for something that's purely temporal:
- Before: Is the nap in progress? Check `lifecycle.state === "started"`.
- After: Is the nap in progress? Check `lifecycle.state === "recorded" && startTime <= now < effectiveEndOf(...)`.

This is simpler because "in progress" was always about time — the state just tracked it redundantly and expensively (required a separate Firestore write just to mark start vs. end).

### Auto-extend math

When `now > nap.endTime` for a recorded nap:
```
extensions = min(3, floor((now - nap.endTime) / napLen) + 1)
effectiveEnd = nap.endTime + extensions * napLen
```

Cap: after 3 extensions, effectiveEnd stays at `nap.startTime + 4×napLen`.

### Drop actions

`START` and `END` lifecycle actions are removed. `NapActionButton` "Start Nap Now" uses `recorded` directly. `handleEndNap` uses `TIME_EDIT` (recorded → completed).

## Tests

- `src/v3/lib/effectiveEnd.test.ts` — NEW, 7 tests covering all extension cases + cap
- `src/v3/lifecycle.test.ts` — updated: START/END tests dropped, all overridden→recorded
- `src/v3/engine/rules/naps.test.ts` — auto-extend cascade test added
- `src/v3/components/Timeline/expandPutdown.test.ts` — time-based in-progress + cap test
- `src/v3/components/Dashboard/NapActionButton.test.tsx` — asserts endTime set + lifecycle recorded
- `src/v3/__tests__/startNapThenRender.test.ts` — updated + cap test added

## Contaminated data

**Dev/emulator only.** Existing docs in Firestore from pre-PR code may have:
- `lifecycle: { state: "started", committedAt: N }` — incompatible with the new union
- `lifecycle: { state: "overridden", annotatedAt: N }` — field name unchanged, but state name changed

**Resolution: wipe the local emulator before testing.** No prod data exists. For future Firestore docs: the Firestore converter in `src/v3/firestore/converters.ts` may need a migration pass if old documents persist in staging — check before any staging deployment.

## Click test

1. Wipe emulator. Sign in, Start New Day.
2. Click **Start Nap Now** (well before bedtime threshold). Switch to Timeline. Nap renders as a full block from now to now+napLen. NO putdown chip inside it. Wake window 4 starts at the nap's effective end.
3. Don't click End Nap. Wait napLen+1 minutes (or advance fake clock). Refresh. Nap block extends; next wake window pushes back.
4. Wait long enough for 3 extensions total (≈ 3 hours for 60-min napLen). After cap, nap block stops growing.
5. Click **End Nap**. Nap closes at current time. Lifecycle = completed. Cascade re-projects naturally.
6. Click **Start Bedtime Now** (past bedtimeThreshold). Bedtime event minted with endTime = nextDayAt(defaultWakeTime). Timeline renders correctly.

## Checklist
- [x] Tests passing
- [x] No `started` or `overridden` references in src/
- [x] effectiveEndOf used in cascade cursor, inProgressNap selector, expandPutdown R6.8
- [x] NapActionButton always sets endTime on start
- [x] Docs updated (DATA_MODEL.md, ENGINE_SPEC.md)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Task covering it |
|---|---|
| Drop `started` from Lifecycle union | Task 2 |
| Rename `overridden → recorded` | Tasks 2, 3, 4, 5, 6 |
| Final union: `projected | recorded | completed` | Tasks 2 + 3 |
| NapActionButton Start Nap: set endTime + `recorded` lifecycle | Task 9 |
| NapActionButton Start Bedtime: set endTime + `recorded` | Task 9 |
| handleEndNap: TIME_EDIT `recorded → completed` | Task 10 |
| Drop START + END from LifecycleAction | Task 3 |
| DRAWER_SAVE formerly-`started` branch → `recorded` | Task 3 |
| `isRecorded`: `recorded || completed` | Task 2 |
| `effectiveEndOf` utility | Task 1 |
| Cascade cursor uses effectiveEndOf | Task 6 |
| inProgressNap selector time-based | Task 10 |
| expandPutdown isInProgressSleep time-based | Task 7 |
| expandPutdown windowOverlapsInProgressSleep effectiveEnd | Task 7 |
| effectiveEnd.test.ts: 5+ cases including cap | Task 1 |
| naps.test.ts: auto-extend cascade test | Task 8 |
| expandPutdown.test.ts: cap test | Task 7 |
| NapActionButton.test.tsx: lifecycle recorded, endTime set | Task 9 |
| startNapThenRender seam test updated + cap test | Task 11 |
| DATA_MODEL.md updated | Task 13 |
| ENGINE_SPEC.md updated | Task 13 |
| sameLifecycle evaluator updated | Task 4 |

### Gaps found and fixed

1. The `startedNapSlot` factory in `startNapThenRender.test.ts` uses `started` with no `endTime`. Under the new model, NapActionButton always sets `endTime`. Updated the factory in Task 11 to include `endTime = startTime + napLen`.

2. The `overridden` fixture in `naps.test.ts` (line ~174) must be renamed. Added explicit step in Task 8.

3. The `aRecordedNap` factory in `factories.ts` needs checking — it uses `completed` as default which is valid and unchanged. No modification needed for the factory itself.

4. `effectiveEndOf` in the archived-day path (no `nowMinutes`): the `expandPutdown.ts` receives `nowMinutes?: TimeMin`. In `isInProgressSleep`, when `nowMinutes` is undefined, we skip the in-progress filter entirely (the `inProgressSleeps` list is empty when `now === undefined`). This preserves the archived-day behavior where all hasPutdown events render.

5. DRAWER_SAVE case for `recorded` source: the old code had `if (current.state === "started" || current.state === "completed") return current;`. With the rename, `recorded` takes the place of `started` here — but `recorded` should NOT be frozen like `completed`. A `recorded` nap can have its times re-anchored via DRAWER_SAVE. The new lifecycle.ts handles this correctly: only `completed` is frozen; `recorded` is mutable per the DRAWER_SAVE cases.
