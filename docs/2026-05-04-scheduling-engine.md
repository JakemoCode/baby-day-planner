# Baby Day Planner — Scheduling Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure TypeScript scheduling engine that projects a baby's day from `Settings` + recorded actuals, encoding every rule from the PRD §Scheduling Rules. The engine has zero React/Firebase/DOM dependencies — only Vitest unit tests.

**Architecture:** A `src/domain/` module composed of small focused files (types, time utilities, per-rule projectors), composed by a single top-level `projectDay()` function. All times are represented as **minutes-from-day-start** internally (e.g., `7:30 AM` = 450) and converted at module boundaries via `parseTime` / `formatTime`. Cross-midnight events (e.g., dream feed at 11:00 PM) use minutes ≥ 1440 — no date math required. Inputs are plain data; outputs are sorted `Event[]`. Every rule is independently testable.

**Tech Stack:** TypeScript 5.6 (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest 2 for unit testing. No runtime dependencies — engine is pure.

**Prerequisites:** Bootstrap plan complete (`docs/2026-05-04-bootstrap.md`). `src/domain/` exists; Vitest configured.

---

## File Structure

All under `src/domain/`:

| File | Responsibility |
|---|---|
| `types.ts` | All public types (`Settings`, `Day`, `Event`, `BottleRule`, `DreamFeedSettings`, `OwnershipTemplate`, `ProjectInput`) |
| `time.ts` | `parseTime`, `formatTime`, `addMinutes`, `diffMinutes`, `nowMinutes` |
| `bottleRules.ts` | `intervalForAmount(rules, amountOz, defaultMinutes)` |
| `napChain.ts` | Project wake event + wake-window + nap chain from wake time and settings |
| `napActuals.ts` | Apply actual nap start/end overrides; compute short-nap adjustment |
| `bedtime.ts` | Substitute last projected nap with bedtime when past threshold |
| `putdown.ts` | Generate "Start putting down for Nap N" events from projected naps |
| `bottleChain.ts` | Project bottle 2..N from bottle 1 actual + interval rules |
| `bottleOverlap.ts` | Resolve bottle/nap overlap (move to nearest boundary, re-anchor) |
| `bottleSuppress.ts` | Drop projected regular bottles at/after bedtime |
| `dreamFeed.ts` | Project the single dream feed event |
| `extras.ts` | Pass-through merging of pump events + extra events |
| `owners.ts` | Apply ownership template + weekend flip/copy helpers |
| `project.ts` | `projectDay(input)` — composes everything in correct order |
| `selectors.ts` | Dashboard helpers: `nextEvent`, `nextBottle`, `nextNap`, `currentWakeWindow`, `projectedBedtime` |
| `__fixtures__/sample.ts` | Reusable test fixtures (default settings, sample day) |

Each file has a colocated `*.test.ts`.

---

## Task 1: Types module

**Files:**
- Create: `src/domain/types.ts`
- Test: (none — types are exercised by every later test)

- [ ] **Step 1: Write `src/domain/types.ts`**

```ts
export type Owner = "Jake" | "Kelly" | "Daycare";

export type EventType =
  | "wake"
  | "wake_window"
  | "putdown"
  | "nap"
  | "bottle"
  | "pump"
  | "bedtime"
  | "dream_feed"
  | "extra";

export type EventSource = "actual" | "projected" | "manual" | "template";
export type EventStatus = "projected" | "actual" | "overridden" | "completed";

export type Event = {
  id: string;
  dayId: string;
  eventKey: string;
  type: EventType;
  label: string;
  startTime: string;     // "HH:MM" or "HH:MM" with hours 24+ for cross-midnight
  endTime?: string;
  owner?: Owner;
  amountOz?: number;
  source: EventSource;
  status: EventStatus;
};

export type BottleRule = {
  minOz: number;
  maxOz?: number;        // open-ended if undefined
  intervalMinutes: number;
};

export type DreamFeedSettings = {
  enabled: boolean;
  earliestTime: string;            // "HH:MM"
  latestTime: string;              // "HH:MM" (cap, max 21:00 per PRD)
  minMinutesAfterBedtime: number;  // default 90
};

export type Settings = {
  childId: string;
  defaultBottleAmountOz: number;
  defaultBottleIntervalMinutes: number; // fallback when no rule matches
  defaultNapLengthMinutes: number;
  putdownLeadMinutes: number;
  bedtimeThreshold: string;             // "HH:MM"
  shortNapThresholdMinutes: number;
  shortNapAdjustmentMinutes: number;
  wakeWindowsMinutes: number[];
  bottleRules: BottleRule[];
  dreamFeed: DreamFeedSettings;
  pumpTimes: string[];                  // "HH:MM"[]
};

export type Day = {
  id: string;
  childId: string;
  date: string;          // "YYYY-MM-DD"
  status: "planned" | "active" | "archived";
  wakeTime?: string;     // "HH:MM"
  ownershipTemplateId?: string;
  createdAt: string;
  archivedAt?: string;
};

export type OwnershipTemplate = {
  id: string;
  label: string;            // e.g. "Saturday"
  napOwners: Owner[];       // index = nap N - 1
  wakeWindowOwners: Owner[];// index = ww N - 1
};

export type ProjectInput = {
  day: Day;
  settings: Settings;
  actuals: Event[];                 // events with source: "actual" | "manual"
  template?: OwnershipTemplate;
  nowMinutes?: number;              // for "now" comparisons in overlap rule; default = end of day
};
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/domain/types.ts
git commit -m "feat(domain): types for Settings, Day, Event, BottleRule, DreamFeed"
```

---

## Task 2: Time utilities

**Files:**
- Create: `src/domain/time.ts`, `src/domain/time.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/domain/time.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseTime, formatTime, addMinutes, diffMinutes, clampTime } from "./time";

describe("parseTime", () => {
  it("converts HH:MM to minutes from day start", () => {
    expect(parseTime("00:00")).toBe(0);
    expect(parseTime("07:30")).toBe(450);
    expect(parseTime("23:59")).toBe(1439);
  });

  it("supports cross-midnight values like 25:30", () => {
    expect(parseTime("25:30")).toBe(1530);
  });

  it("throws on malformed input", () => {
    expect(() => parseTime("7:5")).toThrow();
    expect(() => parseTime("ab:cd")).toThrow();
  });
});

describe("formatTime", () => {
  it("converts minutes back to HH:MM", () => {
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(450)).toBe("07:30");
    expect(formatTime(1439)).toBe("23:59");
  });

  it("preserves cross-midnight values as 25:30 form", () => {
    expect(formatTime(1530)).toBe("25:30");
  });

  it("rejects negative minutes", () => {
    expect(() => formatTime(-1)).toThrow();
  });
});

describe("addMinutes / diffMinutes", () => {
  it("adds minutes", () => {
    expect(addMinutes("07:30", 90)).toBe("09:00");
    expect(addMinutes("23:00", 120)).toBe("25:00");
  });

  it("computes signed difference", () => {
    expect(diffMinutes("09:00", "07:30")).toBe(90);
    expect(diffMinutes("07:30", "09:00")).toBe(-90);
  });
});

describe("clampTime", () => {
  it("clamps to [min, max] inclusive", () => {
    expect(clampTime("12:00", "10:00", "14:00")).toBe("12:00");
    expect(clampTime("09:00", "10:00", "14:00")).toBe("10:00");
    expect(clampTime("15:00", "10:00", "14:00")).toBe("14:00");
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
pnpm test src/domain/time.test.ts
```

Expected: cannot find module `./time`.

- [ ] **Step 3: Implement `src/domain/time.ts`**

```ts
const TIME_RE = /^(\d{2}):(\d{2})$/;

export function parseTime(s: string): number {
  const m = TIME_RE.exec(s);
  if (!m) throw new Error(`Invalid time: ${s}`);
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    throw new Error(`Invalid time: ${s}`);
  }
  if (minutes < 0 || minutes > 59) throw new Error(`Invalid minutes: ${s}`);
  return hours * 60 + minutes;
}

export function formatTime(totalMinutes: number): string {
  if (totalMinutes < 0) throw new Error(`Negative minutes: ${totalMinutes}`);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function addMinutes(time: string, minutes: number): string {
  return formatTime(parseTime(time) + minutes);
}

export function diffMinutes(a: string, b: string): number {
  return parseTime(a) - parseTime(b);
}

export function clampTime(time: string, min: string, max: string): string {
  const t = parseTime(time);
  const lo = parseTime(min);
  const hi = parseTime(max);
  if (t < lo) return min;
  if (t > hi) return max;
  return time;
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
pnpm test src/domain/time.test.ts
```

Expected: all assertions pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/time.ts src/domain/time.test.ts
git commit -m "feat(domain): time utilities (parseTime, formatTime, addMinutes, diffMinutes, clampTime)"
```

---

## Task 3: Test fixtures

**Files:**
- Create: `src/domain/__fixtures__/sample.ts`

- [ ] **Step 1: Write `src/domain/__fixtures__/sample.ts`**

```ts
import type { Day, Settings, OwnershipTemplate } from "../types";

export const sampleSettings: Settings = {
  childId: "child-1",
  defaultBottleAmountOz: 5,
  defaultBottleIntervalMinutes: 180,
  defaultNapLengthMinutes: 60,
  putdownLeadMinutes: 15,
  bedtimeThreshold: "19:00",
  shortNapThresholdMinutes: 35,
  shortNapAdjustmentMinutes: 10,
  wakeWindowsMinutes: [120, 135, 135, 150],
  bottleRules: [
    { minOz: 0, maxOz: 5.5, intervalMinutes: 150 },
    { minOz: 5.6, intervalMinutes: 180 },
  ],
  dreamFeed: {
    enabled: true,
    earliestTime: "20:30",
    latestTime: "21:00",
    minMinutesAfterBedtime: 90,
  },
  pumpTimes: ["10:30", "14:30"],
};

export const sampleDay: Day = {
  id: "day-1",
  childId: "child-1",
  date: "2026-05-04",
  status: "active",
  wakeTime: "07:00",
  createdAt: "2026-05-04T07:00:00Z",
};

export const saturdayTemplate: OwnershipTemplate = {
  id: "tmpl-saturday",
  label: "Saturday",
  napOwners: ["Kelly", "Jake", "Kelly", "Jake"],
  wakeWindowOwners: ["Jake", "Kelly", "Jake", "Kelly"],
};
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/domain/__fixtures__/
git commit -m "test(domain): sample Settings, Day, and OwnershipTemplate fixtures"
```

---

## Task 4: Bottle interval rules lookup

**Files:**
- Create: `src/domain/bottleRules.ts`, `src/domain/bottleRules.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/domain/bottleRules.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { intervalForAmount } from "./bottleRules";
import { sampleSettings } from "./__fixtures__/sample";

describe("intervalForAmount", () => {
  const rules = sampleSettings.bottleRules;
  const fallback = sampleSettings.defaultBottleIntervalMinutes;

  it("returns interval for amount within first range (0–5.5oz)", () => {
    expect(intervalForAmount(rules, 4.5, fallback)).toBe(150);
    expect(intervalForAmount(rules, 5.5, fallback)).toBe(150);
  });

  it("returns interval for open-ended range (5.6+oz)", () => {
    expect(intervalForAmount(rules, 6, fallback)).toBe(180);
    expect(intervalForAmount(rules, 8, fallback)).toBe(180);
  });

  it("returns fallback when amount is undefined", () => {
    expect(intervalForAmount(rules, undefined, fallback)).toBe(180);
  });

  it("returns fallback when no rule matches", () => {
    expect(intervalForAmount([{ minOz: 10, intervalMinutes: 240 }], 3, fallback)).toBe(180);
  });

  it("picks the most specific matching rule when multiple apply", () => {
    const overlapping = [
      { minOz: 0, intervalMinutes: 120 },
      { minOz: 4, maxOz: 6, intervalMinutes: 180 },
    ];
    expect(intervalForAmount(overlapping, 5, 999)).toBe(180);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm test src/domain/bottleRules.test.ts
```

Expected: cannot find module.

- [ ] **Step 3: Implement `src/domain/bottleRules.ts`**

```ts
import type { BottleRule } from "./types";

export function intervalForAmount(
  rules: BottleRule[],
  amountOz: number | undefined,
  fallbackMinutes: number,
): number {
  if (amountOz === undefined) return fallbackMinutes;
  const matches = rules.filter(
    (r) => amountOz >= r.minOz && (r.maxOz === undefined || amountOz <= r.maxOz),
  );
  if (matches.length === 0) return fallbackMinutes;
  // Most specific = narrowest range; open-ended ranges (maxOz undefined) are least specific.
  matches.sort((a, b) => {
    const aSpan = a.maxOz === undefined ? Infinity : a.maxOz - a.minOz;
    const bSpan = b.maxOz === undefined ? Infinity : b.maxOz - b.minOz;
    return aSpan - bSpan;
  });
  return matches[0]!.intervalMinutes;
}
```

- [ ] **Step 4: Run test to confirm pass**

```bash
pnpm test src/domain/bottleRules.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/domain/bottleRules.ts src/domain/bottleRules.test.ts
git commit -m "feat(domain): intervalForAmount with most-specific-rule selection"
```

---

## Task 5: Wake event + wake-window/nap chain projection

**Files:**
- Create: `src/domain/napChain.ts`, `src/domain/napChain.test.ts`

This task projects the **base** nap chain ignoring actuals. Actuals override in Task 6.

- [ ] **Step 1: Write failing tests**

Create `src/domain/napChain.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { projectNapChain } from "./napChain";
import { sampleSettings, sampleDay } from "./__fixtures__/sample";

describe("projectNapChain", () => {
  it("returns empty when wakeTime is undefined", () => {
    expect(projectNapChain({ ...sampleDay, wakeTime: undefined }, sampleSettings)).toEqual([]);
  });

  it("emits wake event at wakeTime", () => {
    const events = projectNapChain(sampleDay, sampleSettings);
    expect(events[0]).toMatchObject({ type: "wake", startTime: "07:00", source: "projected" });
  });

  it("alternates wake_window then nap blocks based on wakeWindowsMinutes", () => {
    const events = projectNapChain(sampleDay, sampleSettings);
    // Wake at 07:00; ww[0]=120 → Nap 1 starts 09:00, ends 10:00 (defaultNap=60)
    // ww[1]=135 → Nap 2 starts 12:15, ends 13:15
    // ww[2]=135 → Nap 3 starts 15:30, ends 16:30
    // ww[3]=150 → Nap 4 starts 19:00, ends 20:00 (Bedtime substitution handled later)
    const types = events.map((e) => `${e.type}:${e.startTime}-${e.endTime ?? ""}`);
    expect(types).toEqual([
      "wake:07:00-",
      "wake_window:07:00-09:00",
      "nap:09:00-10:00",
      "wake_window:10:00-12:15",
      "nap:12:15-13:15",
      "wake_window:13:15-15:30",
      "nap:15:30-16:30",
      "wake_window:16:30-19:00",
      "nap:19:00-20:00",
    ]);
  });

  it("labels naps Nap 1, Nap 2, ...", () => {
    const events = projectNapChain(sampleDay, sampleSettings);
    const napLabels = events.filter((e) => e.type === "nap").map((e) => e.label);
    expect(napLabels).toEqual(["Nap 1", "Nap 2", "Nap 3", "Nap 4"]);
  });

  it("labels wake windows Wake Window 1, 2, ...", () => {
    const events = projectNapChain(sampleDay, sampleSettings);
    const wwLabels = events.filter((e) => e.type === "wake_window").map((e) => e.label);
    expect(wwLabels).toEqual(["Wake Window 1", "Wake Window 2", "Wake Window 3", "Wake Window 4"]);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm test src/domain/napChain.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement `src/domain/napChain.ts`**

```ts
import type { Day, Event, Settings } from "./types";
import { addMinutes } from "./time";

export function projectNapChain(day: Day, settings: Settings): Event[] {
  if (!day.wakeTime) return [];
  const out: Event[] = [];

  out.push({
    id: `proj-${day.id}-wake`,
    dayId: day.id,
    eventKey: "wake",
    type: "wake",
    label: "Wake",
    startTime: day.wakeTime,
    source: "projected",
    status: "projected",
  });

  let cursor = day.wakeTime;
  settings.wakeWindowsMinutes.forEach((wwMins, i) => {
    const wwEnd = addMinutes(cursor, wwMins);
    out.push({
      id: `proj-${day.id}-ww-${i + 1}`,
      dayId: day.id,
      eventKey: `wake_window_${i + 1}`,
      type: "wake_window",
      label: `Wake Window ${i + 1}`,
      startTime: cursor,
      endTime: wwEnd,
      source: "projected",
      status: "projected",
    });

    const napStart = wwEnd;
    const napEnd = addMinutes(napStart, settings.defaultNapLengthMinutes);
    out.push({
      id: `proj-${day.id}-nap-${i + 1}`,
      dayId: day.id,
      eventKey: `nap_${i + 1}`,
      type: "nap",
      label: `Nap ${i + 1}`,
      startTime: napStart,
      endTime: napEnd,
      source: "projected",
      status: "projected",
    });

    cursor = napEnd;
  });

  return out;
}
```

- [ ] **Step 4: Run test to confirm pass**

```bash
pnpm test src/domain/napChain.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/domain/napChain.ts src/domain/napChain.test.ts
git commit -m "feat(domain): project wake event + wake-window/nap chain from settings"
```

---

## Task 6: Apply nap actuals + short-nap adjustment

**Files:**
- Create: `src/domain/napActuals.ts`, `src/domain/napActuals.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/domain/napActuals.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Event } from "./types";
import { applyNapActuals } from "./napActuals";
import { sampleSettings, sampleDay } from "./__fixtures__/sample";
import { projectNapChain } from "./napChain";

const baseProj = projectNapChain(sampleDay, sampleSettings);

function actualNap(n: number, start: string, end: string): Event {
  return {
    id: `actual-nap-${n}`,
    dayId: sampleDay.id,
    eventKey: `nap_${n}`,
    type: "nap",
    label: `Nap ${n}`,
    startTime: start,
    endTime: end,
    source: "actual",
    status: "actual",
  };
}

describe("applyNapActuals", () => {
  it("returns the projection unchanged when no actuals provided", () => {
    expect(applyNapActuals(baseProj, [], sampleSettings)).toEqual(baseProj);
  });

  it("replaces projected nap with actual and re-anchors subsequent chain", () => {
    // Actual Nap 1: 09:10–10:15 (started 10 min late, lasted 65 min)
    const actuals = [actualNap(1, "09:10", "10:15")];
    const result = applyNapActuals(baseProj, actuals, sampleSettings);

    const nap1 = result.find((e) => e.eventKey === "nap_1");
    expect(nap1).toMatchObject({ startTime: "09:10", endTime: "10:15", status: "actual" });

    // Wake Window 2 should start at 10:15 and last 135 min → 12:30
    const ww2 = result.find((e) => e.eventKey === "wake_window_2");
    expect(ww2).toMatchObject({ startTime: "10:15", endTime: "12:30" });

    const nap2 = result.find((e) => e.eventKey === "nap_2");
    expect(nap2).toMatchObject({ startTime: "12:30", endTime: "13:30" });
  });

  it("applies short-nap adjustment when nap duration < threshold", () => {
    // Actual Nap 1: 09:00–09:25 (only 25 min, < 35 min threshold)
    // Short-nap adjustment = -10 → next ww[1] becomes 135-10=125 min
    const actuals = [actualNap(1, "09:00", "09:25")];
    const result = applyNapActuals(baseProj, actuals, sampleSettings);

    const ww2 = result.find((e) => e.eventKey === "wake_window_2");
    // Nap 1 ends 09:25, ww2 = 125 min → ends 11:30
    expect(ww2).toMatchObject({ startTime: "09:25", endTime: "11:30" });

    const nap2 = result.find((e) => e.eventKey === "nap_2");
    expect(nap2).toMatchObject({ startTime: "11:30", endTime: "12:30" });
  });

  it("does not adjust when nap exactly meets threshold", () => {
    const actuals = [actualNap(1, "09:00", "09:35")]; // 35 min, == threshold, no adjustment
    const result = applyNapActuals(baseProj, actuals, sampleSettings);
    const ww2 = result.find((e) => e.eventKey === "wake_window_2");
    expect(ww2).toMatchObject({ startTime: "09:35", endTime: "11:50" });
  });

  it("treats actuals without endTime as 'in-progress' and leaves chain projected from default end", () => {
    const actuals: Event[] = [
      { ...actualNap(1, "09:00", "09:00"), endTime: undefined },
    ];
    const result = applyNapActuals(baseProj, actuals, sampleSettings);
    // No endTime → default to start + defaultNapLengthMinutes for chain re-anchor
    const ww2 = result.find((e) => e.eventKey === "wake_window_2");
    expect(ww2?.startTime).toBe("10:00");
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm test src/domain/napActuals.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement `src/domain/napActuals.ts`**

```ts
import type { Event, Settings } from "./types";
import { addMinutes, diffMinutes, parseTime } from "./time";

export function applyNapActuals(
  projected: Event[],
  actuals: Event[],
  settings: Settings,
): Event[] {
  const napActualsByKey = new Map<string, Event>();
  for (const a of actuals) {
    if (a.type === "nap") napActualsByKey.set(a.eventKey, a);
  }
  if (napActualsByKey.size === 0) return projected;

  const result: Event[] = [];
  const wake = projected.find((e) => e.type === "wake");
  if (wake) result.push(wake);

  let cursor = wake?.startTime ?? "00:00";
  const napCount = projected.filter((e) => e.type === "nap").length;

  for (let i = 1; i <= napCount; i++) {
    const wwKey = `wake_window_${i}`;
    const napKey = `nap_${i}`;
    const projWw = projected.find((e) => e.eventKey === wwKey);
    const projNap = projected.find((e) => e.eventKey === napKey);
    if (!projWw || !projNap) continue;

    const projWwMinutes = diffMinutes(projWw.endTime!, projWw.startTime);
    const prevNapActual = i > 1 ? napActualsByKey.get(`nap_${i - 1}`) : undefined;
    const prevDur =
      prevNapActual && prevNapActual.endTime
        ? diffMinutes(prevNapActual.endTime, prevNapActual.startTime)
        : undefined;
    const isShortPrev =
      prevDur !== undefined && prevDur < settings.shortNapThresholdMinutes;
    const wwMinutes = isShortPrev
      ? projWwMinutes - settings.shortNapAdjustmentMinutes
      : projWwMinutes;

    const wwStart = cursor;
    const wwEnd = addMinutes(wwStart, wwMinutes);
    result.push({
      ...projWw,
      startTime: wwStart,
      endTime: wwEnd,
    });

    const napActual = napActualsByKey.get(napKey);
    if (napActual) {
      const napStart = napActual.startTime;
      const napEnd =
        napActual.endTime ?? addMinutes(napStart, settings.defaultNapLengthMinutes);
      result.push({ ...projNap, ...napActual, startTime: napStart, endTime: napEnd });
      cursor = napEnd;
    } else {
      const napStart = wwEnd;
      const napEnd = addMinutes(napStart, settings.defaultNapLengthMinutes);
      result.push({ ...projNap, startTime: napStart, endTime: napEnd });
      cursor = napEnd;
    }
  }

  // Re-sort by startTime for stability
  return result.sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));
}
```

- [ ] **Step 4: Run test to confirm pass**

```bash
pnpm test src/domain/napActuals.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/domain/napActuals.ts src/domain/napActuals.test.ts
git commit -m "feat(domain): apply nap actuals with re-anchor and short-nap adjustment"
```

---

## Task 7: Bedtime threshold substitution

**Files:**
- Create: `src/domain/bedtime.ts`, `src/domain/bedtime.test.ts`

PRD: "If projected next nap starts at or after bedtime threshold, show Bedtime instead of another nap."

- [ ] **Step 1: Write failing tests**

Create `src/domain/bedtime.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { applyBedtime } from "./bedtime";
import { sampleSettings, sampleDay } from "./__fixtures__/sample";
import { projectNapChain } from "./napChain";

describe("applyBedtime", () => {
  it("replaces last projected nap with a bedtime point event when its start ≥ threshold", () => {
    // sampleSettings has bedtimeThreshold "19:00"; Nap 4 starts at 19:00 → swap to bedtime
    const proj = projectNapChain(sampleDay, sampleSettings);
    const result = applyBedtime(proj, sampleSettings);

    const nap4 = result.find((e) => e.eventKey === "nap_4");
    expect(nap4).toBeUndefined();

    const bedtime = result.find((e) => e.type === "bedtime");
    expect(bedtime).toMatchObject({
      type: "bedtime",
      label: "Bedtime",
      startTime: "19:00",
      endTime: undefined,
      source: "projected",
    });
  });

  it("does not affect naps before threshold", () => {
    const proj = projectNapChain(sampleDay, sampleSettings);
    const result = applyBedtime(proj, sampleSettings);
    expect(result.find((e) => e.eventKey === "nap_1")).toBeDefined();
    expect(result.find((e) => e.eventKey === "nap_2")).toBeDefined();
    expect(result.find((e) => e.eventKey === "nap_3")).toBeDefined();
  });

  it("leaves wake window before bedtime intact", () => {
    const proj = projectNapChain(sampleDay, sampleSettings);
    const result = applyBedtime(proj, sampleSettings);
    const ww4 = result.find((e) => e.eventKey === "wake_window_4");
    expect(ww4).toMatchObject({ startTime: "16:30", endTime: "19:00" });
  });

  it("emits no bedtime if all naps fit before threshold", () => {
    const earlyBedtime = { ...sampleSettings, bedtimeThreshold: "23:00" };
    const proj = projectNapChain(sampleDay, earlyBedtime);
    const result = applyBedtime(proj, earlyBedtime);
    expect(result.find((e) => e.type === "bedtime")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm test src/domain/bedtime.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement `src/domain/bedtime.ts`**

```ts
import type { Event, Settings } from "./types";
import { parseTime } from "./time";

export function applyBedtime(events: Event[], settings: Settings): Event[] {
  const bedtimeMins = parseTime(settings.bedtimeThreshold);
  const naps = events.filter((e) => e.type === "nap");
  const replaceIdx = naps.findIndex((n) => parseTime(n.startTime) >= bedtimeMins);
  if (replaceIdx === -1) return events;

  const napToReplace = naps[replaceIdx]!;
  const out = events
    .filter((e) => {
      if (e.id === napToReplace.id) return false;
      // Drop subsequent naps + their wake windows past the bedtime nap
      if (e.type === "nap" && parseTime(e.startTime) >= bedtimeMins) return false;
      if (
        e.type === "wake_window" &&
        parseTime(e.startTime) >= parseTime(napToReplace.startTime)
      ) {
        return false;
      }
      return true;
    })
    .concat([
      {
        id: `proj-${napToReplace.dayId}-bedtime`,
        dayId: napToReplace.dayId,
        eventKey: "bedtime",
        type: "bedtime",
        label: "Bedtime",
        startTime: napToReplace.startTime,
        source: "projected",
        status: "projected",
      },
    ]);

  return out.sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));
}
```

- [ ] **Step 4: Run test to confirm pass**

```bash
pnpm test src/domain/bedtime.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/domain/bedtime.ts src/domain/bedtime.test.ts
git commit -m "feat(domain): substitute Bedtime for projected nap past threshold"
```

---

## Task 8: Putdown lead-time generator

**Files:**
- Create: `src/domain/putdown.ts`, `src/domain/putdown.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/domain/putdown.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Event } from "./types";
import { addPutdownEvents } from "./putdown";
import { sampleSettings } from "./__fixtures__/sample";

const napProjected = (n: number, start: string): Event => ({
  id: `proj-day-1-nap-${n}`,
  dayId: "day-1",
  eventKey: `nap_${n}`,
  type: "nap",
  label: `Nap ${n}`,
  startTime: start,
  endTime: "00:00",
  owner: "Jake",
  source: "projected",
  status: "projected",
});

describe("addPutdownEvents", () => {
  it("inserts a putdown event 15 min before each projected nap", () => {
    const events: Event[] = [napProjected(1, "09:00"), napProjected(2, "12:15")];
    const result = addPutdownEvents(events, sampleSettings);
    const putdowns = result.filter((e) => e.type === "putdown");
    expect(putdowns).toHaveLength(2);
    expect(putdowns[0]).toMatchObject({
      type: "putdown",
      label: "Start putting down for Nap 1",
      startTime: "08:45",
      owner: "Jake",
      source: "projected",
    });
    expect(putdowns[1]).toMatchObject({ startTime: "12:00", label: "Start putting down for Nap 2" });
  });

  it("uses configured putdownLeadMinutes", () => {
    const events: Event[] = [napProjected(1, "09:00")];
    const result = addPutdownEvents(events, { ...sampleSettings, putdownLeadMinutes: 30 });
    const pd = result.find((e) => e.type === "putdown");
    expect(pd?.startTime).toBe("08:30");
  });

  it("does not insert putdown for actual naps", () => {
    const events: Event[] = [{ ...napProjected(1, "09:00"), source: "actual", status: "actual" }];
    const result = addPutdownEvents(events, sampleSettings);
    expect(result.filter((e) => e.type === "putdown")).toHaveLength(0);
  });

  it("leaves non-nap events untouched", () => {
    const events: Event[] = [
      napProjected(1, "09:00"),
      {
        id: "x",
        dayId: "day-1",
        eventKey: "bottle_1",
        type: "bottle",
        label: "Bottle 1",
        startTime: "07:05",
        source: "projected",
        status: "projected",
      },
    ];
    const result = addPutdownEvents(events, sampleSettings);
    expect(result.find((e) => e.type === "bottle")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm test src/domain/putdown.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement `src/domain/putdown.ts`**

```ts
import type { Event, Settings } from "./types";
import { addMinutes, parseTime } from "./time";

export function addPutdownEvents(events: Event[], settings: Settings): Event[] {
  const additions: Event[] = [];
  for (const e of events) {
    if (e.type !== "nap") continue;
    if (e.source !== "projected") continue;
    additions.push({
      id: `${e.id}-putdown`,
      dayId: e.dayId,
      eventKey: `${e.eventKey}_putdown`,
      type: "putdown",
      label: `Start putting down for ${e.label}`,
      startTime: addMinutes(e.startTime, -settings.putdownLeadMinutes),
      ...(e.owner !== undefined ? { owner: e.owner } : {}),
      source: "projected",
      status: "projected",
    });
  }
  return [...events, ...additions].sort(
    (a, b) => parseTime(a.startTime) - parseTime(b.startTime),
  );
}
```

- [ ] **Step 4: Run test to confirm pass**

```bash
pnpm test src/domain/putdown.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/domain/putdown.ts src/domain/putdown.test.ts
git commit -m "feat(domain): generate putdown events with configurable lead time"
```

---

## Task 9: Bottle chain projection

**Files:**
- Create: `src/domain/bottleChain.ts`, `src/domain/bottleChain.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/domain/bottleChain.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Event } from "./types";
import { projectBottleChain } from "./bottleChain";
import { sampleSettings, sampleDay } from "./__fixtures__/sample";

const bottle = (n: number, start: string, oz: number, source: "actual" | "manual" = "actual"): Event => ({
  id: `actual-bottle-${n}`,
  dayId: sampleDay.id,
  eventKey: `bottle_${n}`,
  type: "bottle",
  label: `Bottle ${n}`,
  startTime: start,
  amountOz: oz,
  source,
  status: source === "actual" ? "actual" : "overridden",
});

describe("projectBottleChain", () => {
  it("returns empty when no Bottle 1 actual exists", () => {
    expect(projectBottleChain([], sampleSettings, sampleDay)).toEqual([]);
  });

  it("projects a 5oz Bottle 1 to next bottle 2:30 later", () => {
    // 5 oz < 5.5 → 150 min
    const result = projectBottleChain([bottle(1, "07:05", 5)], sampleSettings, sampleDay);
    const bottle2 = result.find((e) => e.eventKey === "bottle_2");
    expect(bottle2).toMatchObject({
      startTime: "09:35",
      amountOz: 5,
      source: "projected",
      status: "projected",
    });
  });

  it("projects a 6oz Bottle 1 to next bottle 3:00 later", () => {
    const result = projectBottleChain([bottle(1, "07:05", 6)], sampleSettings, sampleDay);
    expect(result.find((e) => e.eventKey === "bottle_2")?.startTime).toBe("10:05");
  });

  it("re-anchors chain from a manual edit on Bottle N", () => {
    // Bottle 1 actual 07:00 (5oz) and Bottle 2 manual at 10:00 (6oz)
    // Bottle 3 should project from 10:00 + 180 = 13:00
    const actuals = [bottle(1, "07:00", 5), bottle(2, "10:00", 6, "manual")];
    const result = projectBottleChain(actuals, sampleSettings, sampleDay);
    expect(result.find((e) => e.eventKey === "bottle_3")?.startTime).toBe("13:00");
  });

  it("uses defaultBottleAmountOz for projected bottles' amount", () => {
    const result = projectBottleChain([bottle(1, "07:00", 4.5)], sampleSettings, sampleDay);
    const b2 = result.find((e) => e.eventKey === "bottle_2");
    expect(b2?.amountOz).toBe(sampleSettings.defaultBottleAmountOz);
  });

  it("stops projecting when next bottle would land past 23:00", () => {
    // Pathological short interval to force stop
    const wide = { ...sampleSettings, bottleRules: [{ minOz: 0, intervalMinutes: 60 }] };
    const result = projectBottleChain([bottle(1, "20:00", 5)], wide, sampleDay);
    const lastBottle = result[result.length - 1]!;
    // Final projected start must be < 23:00
    const [hh] = lastBottle.startTime.split(":");
    expect(Number(hh)).toBeLessThan(23);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm test src/domain/bottleChain.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement `src/domain/bottleChain.ts`**

```ts
import type { Day, Event, Settings } from "./types";
import { addMinutes, parseTime } from "./time";
import { intervalForAmount } from "./bottleRules";

const HARD_STOP_MINUTES = 23 * 60;

export function projectBottleChain(
  actuals: Event[],
  settings: Settings,
  day: Day,
): Event[] {
  const bottleActuals = actuals
    .filter((e) => e.type === "bottle" && (e.source === "actual" || e.source === "manual"))
    .sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));

  if (bottleActuals.length === 0) return [];

  const out: Event[] = [...bottleActuals];

  // Anchor = the highest-numbered bottle actual we have
  const anchor = bottleActuals[bottleActuals.length - 1]!;
  const anchorIdx = parseInt(anchor.eventKey.replace("bottle_", ""), 10);
  let cursorTime = anchor.startTime;
  let cursorAmount = anchor.amountOz;

  let n = anchorIdx + 1;
  while (true) {
    const interval = intervalForAmount(
      settings.bottleRules,
      cursorAmount,
      settings.defaultBottleIntervalMinutes,
    );
    const nextStart = addMinutes(cursorTime, interval);
    if (parseTime(nextStart) >= HARD_STOP_MINUTES) break;
    out.push({
      id: `proj-${day.id}-bottle-${n}`,
      dayId: day.id,
      eventKey: `bottle_${n}`,
      type: "bottle",
      label: `Bottle ${n}`,
      startTime: nextStart,
      amountOz: settings.defaultBottleAmountOz,
      source: "projected",
      status: "projected",
    });
    cursorTime = nextStart;
    cursorAmount = settings.defaultBottleAmountOz;
    n++;
    if (n > 12) break; // hard cap
  }

  return out.sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));
}
```

- [ ] **Step 4: Run test to confirm pass**

```bash
pnpm test src/domain/bottleChain.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/domain/bottleChain.ts src/domain/bottleChain.test.ts
git commit -m "feat(domain): project bottle chain from latest actual with rule-based intervals"
```

---

## Task 10: Bottle/nap overlap resolution

**Files:**
- Create: `src/domain/bottleOverlap.ts`, `src/domain/bottleOverlap.test.ts`

PRD: "If projected bottle time falls during a nap: move the bottle to whichever nap boundary is closest. Re-anchor later bottles. If moving to the earlier boundary would put bottle before 'now,' choose the later boundary."

- [ ] **Step 1: Write failing tests**

Create `src/domain/bottleOverlap.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Event } from "./types";
import { resolveBottleNapOverlap } from "./bottleOverlap";
import { sampleSettings, sampleDay } from "./__fixtures__/sample";
import { parseTime } from "./time";

const nap = (n: number, start: string, end: string): Event => ({
  id: `nap-${n}`,
  dayId: sampleDay.id,
  eventKey: `nap_${n}`,
  type: "nap",
  label: `Nap ${n}`,
  startTime: start,
  endTime: end,
  source: "projected",
  status: "projected",
});

const projBottle = (n: number, start: string): Event => ({
  id: `pb-${n}`,
  dayId: sampleDay.id,
  eventKey: `bottle_${n}`,
  type: "bottle",
  label: `Bottle ${n}`,
  startTime: start,
  amountOz: 5,
  source: "projected",
  status: "projected",
});

const actualBottle = (n: number, start: string): Event => ({
  ...projBottle(n, start),
  source: "actual",
  status: "actual",
});

describe("resolveBottleNapOverlap", () => {
  it("moves bottle to closer boundary (later) when projected time is past nap midpoint", () => {
    // Nap: 12:05–12:50 (midpoint 12:27); bottle projected 12:40 → closer to end → 12:50
    const events = [nap(1, "12:05", "12:50"), projBottle(2, "12:40")];
    const result = resolveBottleNapOverlap(events, sampleSettings, sampleDay, 0);
    const b = result.find((e) => e.eventKey === "bottle_2");
    expect(b?.startTime).toBe("12:50");
  });

  it("moves bottle to earlier boundary when closer to nap start", () => {
    // Nap: 12:05–12:50; bottle projected 12:10 → closer to start → 12:05
    const events = [nap(1, "12:05", "12:50"), projBottle(2, "12:10")];
    const result = resolveBottleNapOverlap(events, sampleSettings, sampleDay, 0);
    expect(result.find((e) => e.eventKey === "bottle_2")?.startTime).toBe("12:05");
  });

  it("falls back to later boundary if earlier would be before now", () => {
    // Nap 12:05–12:50; bottle at 12:10; nowMinutes = 12:08
    const now = parseTime("12:08");
    const events = [nap(1, "12:05", "12:50"), projBottle(2, "12:10")];
    const result = resolveBottleNapOverlap(events, sampleSettings, sampleDay, now);
    expect(result.find((e) => e.eventKey === "bottle_2")?.startTime).toBe("12:50");
  });

  it("re-anchors subsequent projected bottles using the moved bottle's time", () => {
    // Nap: 12:05–12:50; B2 projected 12:40 → moves to 12:50; B3 was 15:10 → now 12:50+150=15:20
    const events = [
      nap(1, "12:05", "12:50"),
      projBottle(2, "12:40"),
      projBottle(3, "15:10"),
    ];
    const result = resolveBottleNapOverlap(events, sampleSettings, sampleDay, 0);
    expect(result.find((e) => e.eventKey === "bottle_3")?.startTime).toBe("15:20");
  });

  it("does not move actual bottles", () => {
    const events = [nap(1, "12:05", "12:50"), actualBottle(2, "12:30")];
    const result = resolveBottleNapOverlap(events, sampleSettings, sampleDay, 0);
    expect(result.find((e) => e.eventKey === "bottle_2")?.startTime).toBe("12:30");
  });

  it("leaves bottles entirely outside any nap untouched", () => {
    const events = [nap(1, "12:05", "12:50"), projBottle(2, "11:00")];
    const result = resolveBottleNapOverlap(events, sampleSettings, sampleDay, 0);
    expect(result.find((e) => e.eventKey === "bottle_2")?.startTime).toBe("11:00");
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm test src/domain/bottleOverlap.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement `src/domain/bottleOverlap.ts`**

```ts
import type { Day, Event, Settings } from "./types";
import { addMinutes, parseTime } from "./time";
import { intervalForAmount } from "./bottleRules";

export function resolveBottleNapOverlap(
  events: Event[],
  settings: Settings,
  _day: Day,
  nowMinutes: number,
): Event[] {
  const naps = events
    .filter((e) => e.type === "nap" && e.endTime !== undefined)
    .sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));

  const projectedBottles = events
    .filter((e) => e.type === "bottle" && e.source === "projected")
    .sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));

  if (projectedBottles.length === 0 || naps.length === 0) return events;

  const adjusted = new Map<string, string>(); // bottle id → new startTime

  for (const b of projectedBottles) {
    const bMins = parseTime(b.startTime);
    const overlap = naps.find(
      (n) => bMins > parseTime(n.startTime) && bMins < parseTime(n.endTime!),
    );
    if (!overlap) continue;

    const startMins = parseTime(overlap.startTime);
    const endMins = parseTime(overlap.endTime!);
    const distToStart = bMins - startMins;
    const distToEnd = endMins - bMins;
    const earlierWins = distToStart <= distToEnd;
    let newTime = earlierWins ? overlap.startTime : overlap.endTime!;
    if (earlierWins && parseTime(newTime) < nowMinutes) {
      newTime = overlap.endTime!;
    }
    adjusted.set(b.id, newTime);
  }

  if (adjusted.size === 0) return events;

  // Re-anchor: rebuild projected bottles from the earliest moved one onward.
  const out: Event[] = events.map((e) => ({ ...e }));
  for (const b of projectedBottles) {
    const newStart = adjusted.get(b.id);
    if (newStart) {
      const idx = out.findIndex((e) => e.id === b.id);
      out[idx] = { ...out[idx]!, startTime: newStart };
    }
  }

  // Re-project subsequent bottles after each adjustment using interval rules.
  const bottlesSorted = out
    .filter((e) => e.type === "bottle")
    .sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));

  for (let i = 1; i < bottlesSorted.length; i++) {
    const prev = bottlesSorted[i - 1]!;
    const cur = bottlesSorted[i]!;
    if (cur.source !== "projected") continue;
    const interval = intervalForAmount(
      settings.bottleRules,
      prev.amountOz,
      settings.defaultBottleIntervalMinutes,
    );
    const expected = addMinutes(prev.startTime, interval);
    if (cur.startTime !== expected) {
      const idx = out.findIndex((e) => e.id === cur.id);
      out[idx] = { ...out[idx]!, startTime: expected };
      bottlesSorted[i] = { ...cur, startTime: expected };
    }
  }

  return out.sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));
}
```

- [ ] **Step 4: Run test to confirm pass**

```bash
pnpm test src/domain/bottleOverlap.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/domain/bottleOverlap.ts src/domain/bottleOverlap.test.ts
git commit -m "feat(domain): resolve bottle/nap overlap to nearest boundary, re-anchor chain"
```

---

## Task 11: Bottle suppression after bedtime

**Files:**
- Create: `src/domain/bottleSuppress.ts`, `src/domain/bottleSuppress.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/domain/bottleSuppress.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Event } from "./types";
import { suppressBottlesAfterBedtime } from "./bottleSuppress";
import { sampleSettings } from "./__fixtures__/sample";

const ev = (overrides: Partial<Event>): Event => ({
  id: "id",
  dayId: "day-1",
  eventKey: "x",
  type: "bottle",
  label: "x",
  startTime: "00:00",
  source: "projected",
  status: "projected",
  ...overrides,
});

describe("suppressBottlesAfterBedtime", () => {
  it("drops projected regular bottles at or after bedtime threshold", () => {
    const events = [
      ev({ id: "b1", eventKey: "bottle_1", startTime: "07:00", source: "actual", status: "actual" }),
      ev({ id: "b6", eventKey: "bottle_6", startTime: "19:00", source: "projected" }),
      ev({ id: "b7", eventKey: "bottle_7", startTime: "21:30", source: "projected" }),
    ];
    const result = suppressBottlesAfterBedtime(events, sampleSettings);
    expect(result.find((e) => e.id === "b6")).toBeUndefined();
    expect(result.find((e) => e.id === "b7")).toBeUndefined();
    expect(result.find((e) => e.id === "b1")).toBeDefined();
  });

  it("does not drop actual or manual bottles even past bedtime", () => {
    const events = [
      ev({ id: "b6", eventKey: "bottle_6", startTime: "19:30", source: "actual", status: "actual" }),
      ev({ id: "b7", eventKey: "bottle_7", startTime: "20:00", source: "manual", status: "overridden" }),
    ];
    const result = suppressBottlesAfterBedtime(events, sampleSettings);
    expect(result).toHaveLength(2);
  });

  it("does not affect dream feed events", () => {
    const events = [ev({ id: "df", eventKey: "dream_feed", type: "dream_feed", startTime: "20:30" })];
    const result = suppressBottlesAfterBedtime(events, sampleSettings);
    expect(result).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm test src/domain/bottleSuppress.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement `src/domain/bottleSuppress.ts`**

```ts
import type { Event, Settings } from "./types";
import { parseTime } from "./time";

export function suppressBottlesAfterBedtime(events: Event[], settings: Settings): Event[] {
  const cutoff = parseTime(settings.bedtimeThreshold);
  return events.filter((e) => {
    if (e.type !== "bottle") return true;
    if (e.source !== "projected") return true;
    return parseTime(e.startTime) < cutoff;
  });
}
```

- [ ] **Step 4: Run test to confirm pass**

```bash
pnpm test src/domain/bottleSuppress.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/domain/bottleSuppress.ts src/domain/bottleSuppress.test.ts
git commit -m "feat(domain): suppress projected regular bottles at or after bedtime"
```

---

## Task 12: Dream feed projection

**Files:**
- Create: `src/domain/dreamFeed.ts`, `src/domain/dreamFeed.test.ts`

PRD: "Choose earliest configured dream feed time that is at least minimum interval after bedtime. Cap at latest configured time. Suppress if disabled."

- [ ] **Step 1: Write failing tests**

Create `src/domain/dreamFeed.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Event } from "./types";
import { addDreamFeed } from "./dreamFeed";
import { sampleSettings, sampleDay } from "./__fixtures__/sample";

const bedtime = (start: string): Event => ({
  id: "bt",
  dayId: sampleDay.id,
  eventKey: "bedtime",
  type: "bedtime",
  label: "Bedtime",
  startTime: start,
  source: "projected",
  status: "projected",
});

describe("addDreamFeed", () => {
  it("emits dream feed at earliest configured time when ≥ bedtime + min interval", () => {
    // bedtime 19:00 + 90 min = 20:30; earliest = 20:30 → exactly meets
    const events = [bedtime("19:00")];
    const result = addDreamFeed(events, sampleSettings, sampleDay);
    const df = result.find((e) => e.type === "dream_feed");
    expect(df).toMatchObject({ startTime: "20:30", source: "projected", label: "Dream Feed" });
  });

  it("pushes dream feed later when min interval forces it past earliest", () => {
    // bedtime 19:30 + 90 = 21:00; earliest 20:30 → use 21:00
    const result = addDreamFeed([bedtime("19:30")], sampleSettings, sampleDay);
    expect(result.find((e) => e.type === "dream_feed")?.startTime).toBe("21:00");
  });

  it("caps dream feed at latestTime", () => {
    // bedtime 19:45 + 90 = 21:15; cap at latestTime 21:00
    const result = addDreamFeed([bedtime("19:45")], sampleSettings, sampleDay);
    expect(result.find((e) => e.type === "dream_feed")?.startTime).toBe("21:00");
  });

  it("emits no dream feed when disabled", () => {
    const settings = { ...sampleSettings, dreamFeed: { ...sampleSettings.dreamFeed, enabled: false } };
    const result = addDreamFeed([bedtime("19:00")], settings, sampleDay);
    expect(result.find((e) => e.type === "dream_feed")).toBeUndefined();
  });

  it("emits no dream feed when no bedtime is present", () => {
    const result = addDreamFeed([], sampleSettings, sampleDay);
    expect(result.find((e) => e.type === "dream_feed")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm test src/domain/dreamFeed.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement `src/domain/dreamFeed.ts`**

```ts
import type { Day, Event, Settings } from "./types";
import { addMinutes, formatTime, parseTime } from "./time";

export function addDreamFeed(events: Event[], settings: Settings, day: Day): Event[] {
  const cfg = settings.dreamFeed;
  if (!cfg.enabled) return events;
  const bedtime = events.find((e) => e.type === "bedtime");
  if (!bedtime) return events;

  const earliestAllowed = addMinutes(bedtime.startTime, cfg.minMinutesAfterBedtime);
  const earliest =
    parseTime(earliestAllowed) > parseTime(cfg.earliestTime) ? earliestAllowed : cfg.earliestTime;
  const finalStart = parseTime(earliest) > parseTime(cfg.latestTime) ? cfg.latestTime : earliest;

  const dreamFeed: Event = {
    id: `proj-${day.id}-dream-feed`,
    dayId: day.id,
    eventKey: "dream_feed",
    type: "dream_feed",
    label: "Dream Feed",
    startTime: formatTime(parseTime(finalStart)),
    source: "projected",
    status: "projected",
  };
  return [...events, dreamFeed].sort(
    (a, b) => parseTime(a.startTime) - parseTime(b.startTime),
  );
}
```

- [ ] **Step 4: Run test to confirm pass**

```bash
pnpm test src/domain/dreamFeed.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/domain/dreamFeed.ts src/domain/dreamFeed.test.ts
git commit -m "feat(domain): project dream feed with earliest/latest cap and min-after-bedtime"
```

---

## Task 13: Pump and extra event pass-through

**Files:**
- Create: `src/domain/extras.ts`, `src/domain/extras.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/domain/extras.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Event } from "./types";
import { mergePumpsAndExtras } from "./extras";
import { sampleSettings, sampleDay } from "./__fixtures__/sample";

describe("mergePumpsAndExtras", () => {
  it("emits pump events from settings.pumpTimes when no actuals exist", () => {
    const result = mergePumpsAndExtras([], [], sampleSettings, sampleDay);
    const pumps = result.filter((e) => e.type === "pump");
    expect(pumps.map((p) => p.startTime)).toEqual(["10:30", "14:30"]);
    expect(pumps[0]).toMatchObject({ source: "projected", label: "Pump" });
  });

  it("prefers actual pump events over projected ones when times overlap", () => {
    const actuals: Event[] = [
      {
        id: "actual-pump-1",
        dayId: sampleDay.id,
        eventKey: "pump_10:30",
        type: "pump",
        label: "Pump",
        startTime: "10:45",
        source: "actual",
        status: "actual",
      },
    ];
    const result = mergePumpsAndExtras([], actuals, sampleSettings, sampleDay);
    const pumps = result.filter((e) => e.type === "pump");
    expect(pumps.map((p) => p.startTime)).toEqual(["10:45", "14:30"]);
    expect(pumps.find((p) => p.startTime === "10:45")?.source).toBe("actual");
  });

  it("includes extra events with source 'manual'", () => {
    const extras: Event[] = [
      {
        id: "ex-1",
        dayId: sampleDay.id,
        eventKey: "extra_1",
        type: "extra",
        label: "Pediatrician",
        startTime: "11:00",
        source: "manual",
        status: "completed",
      },
    ];
    const result = mergePumpsAndExtras([], extras, sampleSettings, sampleDay);
    expect(result.find((e) => e.label === "Pediatrician")).toBeDefined();
  });

  it("does not duplicate pump events that already exist in input", () => {
    const existing: Event[] = [
      {
        id: "exist-pump",
        dayId: sampleDay.id,
        eventKey: "pump_10:30",
        type: "pump",
        label: "Pump",
        startTime: "10:30",
        source: "projected",
        status: "projected",
      },
    ];
    const result = mergePumpsAndExtras(existing, [], sampleSettings, sampleDay);
    const pumps = result.filter((e) => e.type === "pump");
    expect(pumps).toHaveLength(2); // 10:30 (existing) + 14:30 (added)
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm test src/domain/extras.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement `src/domain/extras.ts`**

```ts
import type { Day, Event, Settings } from "./types";
import { parseTime } from "./time";

export function mergePumpsAndExtras(
  existing: Event[],
  actuals: Event[],
  settings: Settings,
  day: Day,
): Event[] {
  const out: Event[] = [...existing];
  const actualPumpsByTime = new Map<string, Event>();
  for (const a of actuals) {
    if (a.type === "pump") actualPumpsByTime.set(a.eventKey, a);
  }
  const existingPumpKeys = new Set(
    existing.filter((e) => e.type === "pump").map((e) => e.eventKey),
  );

  for (const time of settings.pumpTimes) {
    const key = `pump_${time}`;
    if (existingPumpKeys.has(key)) continue;
    const actual = actualPumpsByTime.get(key);
    if (actual) {
      out.push(actual);
    } else {
      out.push({
        id: `proj-${day.id}-pump-${time}`,
        dayId: day.id,
        eventKey: key,
        type: "pump",
        label: "Pump",
        startTime: time,
        source: "projected",
        status: "projected",
      });
    }
  }

  for (const a of actuals) {
    if (a.type === "extra") out.push(a);
  }

  return out.sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));
}
```

- [ ] **Step 4: Run test to confirm pass**

```bash
pnpm test src/domain/extras.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/domain/extras.ts src/domain/extras.test.ts
git commit -m "feat(domain): merge configured pumps and user extras into the day"
```

---

## Task 14: Owner assignment + weekend template flip/copy

**Files:**
- Create: `src/domain/owners.ts`, `src/domain/owners.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/domain/owners.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Event, OwnershipTemplate } from "./types";
import { applyTemplate, flipTemplate, copyToOtherDay } from "./owners";
import { saturdayTemplate, sampleDay } from "./__fixtures__/sample";

const evt = (
  type: Event["type"],
  eventKey: string,
  start = "07:00",
): Event => ({
  id: eventKey,
  dayId: sampleDay.id,
  eventKey,
  type,
  label: eventKey,
  startTime: start,
  source: "projected",
  status: "projected",
});

describe("applyTemplate", () => {
  it("assigns nap and wake-window owners by index", () => {
    const events = [
      evt("wake_window", "wake_window_1"),
      evt("nap", "nap_1"),
      evt("wake_window", "wake_window_2"),
      evt("nap", "nap_2"),
    ];
    const result = applyTemplate(events, saturdayTemplate);
    expect(result.find((e) => e.eventKey === "nap_1")?.owner).toBe("Kelly");
    expect(result.find((e) => e.eventKey === "nap_2")?.owner).toBe("Jake");
    expect(result.find((e) => e.eventKey === "wake_window_1")?.owner).toBe("Jake");
    expect(result.find((e) => e.eventKey === "wake_window_2")?.owner).toBe("Kelly");
  });

  it("does not overwrite existing owner overrides", () => {
    const overridden: Event = { ...evt("nap", "nap_1"), owner: "Daycare", source: "manual" };
    const result = applyTemplate([overridden], saturdayTemplate);
    expect(result[0]?.owner).toBe("Daycare");
  });

  it("propagates nap owner to corresponding putdown event", () => {
    const events = [evt("nap", "nap_1"), evt("putdown", "nap_1_putdown")];
    const result = applyTemplate(events, saturdayTemplate);
    expect(result.find((e) => e.type === "putdown")?.owner).toBe("Kelly");
  });
});

describe("flipTemplate", () => {
  it("swaps Jake ↔ Kelly leaving Daycare alone", () => {
    const t: OwnershipTemplate = {
      id: "x",
      label: "Y",
      napOwners: ["Jake", "Kelly", "Daycare"],
      wakeWindowOwners: ["Kelly", "Jake"],
    };
    const flipped = flipTemplate(t);
    expect(flipped.napOwners).toEqual(["Kelly", "Jake", "Daycare"]);
    expect(flipped.wakeWindowOwners).toEqual(["Jake", "Kelly"]);
  });
});

describe("copyToOtherDay", () => {
  it("returns a flipped clone with new id and label", () => {
    const sunday = copyToOtherDay(saturdayTemplate, "tmpl-sunday", "Sunday");
    expect(sunday.id).toBe("tmpl-sunday");
    expect(sunday.label).toBe("Sunday");
    expect(sunday.napOwners[0]).toBe("Jake");   // flipped from Kelly
    expect(sunday.napOwners[1]).toBe("Kelly");  // flipped from Jake
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm test src/domain/owners.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement `src/domain/owners.ts`**

```ts
import type { Event, Owner, OwnershipTemplate } from "./types";

export function applyTemplate(events: Event[], template: OwnershipTemplate): Event[] {
  const napIndex = (key: string) => {
    const m = /^nap_(\d+)/.exec(key);
    return m ? Number(m[1]) - 1 : -1;
  };
  const wwIndex = (key: string) => {
    const m = /^wake_window_(\d+)/.exec(key);
    return m ? Number(m[1]) - 1 : -1;
  };
  const putdownNapIndex = (key: string) => {
    const m = /^nap_(\d+)_putdown/.exec(key);
    return m ? Number(m[1]) - 1 : -1;
  };

  return events.map((e) => {
    if (e.owner !== undefined) return e;
    if (e.type === "nap") {
      const i = napIndex(e.eventKey);
      const o = i >= 0 ? template.napOwners[i] : undefined;
      return o ? { ...e, owner: o } : e;
    }
    if (e.type === "wake_window") {
      const i = wwIndex(e.eventKey);
      const o = i >= 0 ? template.wakeWindowOwners[i] : undefined;
      return o ? { ...e, owner: o } : e;
    }
    if (e.type === "putdown") {
      const i = putdownNapIndex(e.eventKey);
      const o = i >= 0 ? template.napOwners[i] : undefined;
      return o ? { ...e, owner: o } : e;
    }
    return e;
  });
}

const flipOwner = (o: Owner): Owner => (o === "Jake" ? "Kelly" : o === "Kelly" ? "Jake" : o);

export function flipTemplate(t: OwnershipTemplate): OwnershipTemplate {
  return {
    ...t,
    napOwners: t.napOwners.map(flipOwner),
    wakeWindowOwners: t.wakeWindowOwners.map(flipOwner),
  };
}

export function copyToOtherDay(
  source: OwnershipTemplate,
  newId: string,
  newLabel: string,
): OwnershipTemplate {
  const flipped = flipTemplate(source);
  return { ...flipped, id: newId, label: newLabel };
}
```

- [ ] **Step 4: Run test to confirm pass**

```bash
pnpm test src/domain/owners.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/domain/owners.ts src/domain/owners.test.ts
git commit -m "feat(domain): apply ownership template and flip/copy weekend templates"
```

---

## Task 15: Master `projectDay` composition

**Files:**
- Create: `src/domain/project.ts`, `src/domain/project.test.ts`

- [ ] **Step 1: Write failing tests (integration-level)**

Create `src/domain/project.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Event } from "./types";
import { projectDay } from "./project";
import { sampleSettings, sampleDay, saturdayTemplate } from "./__fixtures__/sample";

const bottle = (n: number, start: string, oz: number): Event => ({
  id: `actual-bottle-${n}`,
  dayId: sampleDay.id,
  eventKey: `bottle_${n}`,
  type: "bottle",
  label: `Bottle ${n}`,
  startTime: start,
  amountOz: oz,
  source: "actual",
  status: "actual",
});

describe("projectDay (integration)", () => {
  it("returns wake + 4 wake_windows + 3 naps + 1 bedtime + putdowns + dream feed + pumps", () => {
    const out = projectDay({ day: sampleDay, settings: sampleSettings, actuals: [] });
    const counts = out.reduce<Record<string, number>>((m, e) => {
      m[e.type] = (m[e.type] ?? 0) + 1;
      return m;
    }, {});
    expect(counts.wake).toBe(1);
    expect(counts.wake_window).toBe(4);
    expect(counts.nap).toBe(3);
    expect(counts.bedtime).toBe(1);
    expect(counts.putdown).toBe(3); // one per remaining projected nap
    expect(counts.dream_feed).toBe(1);
    expect(counts.pump).toBe(2);
  });

  it("includes Bottle 1 actual and projects the chain forward", () => {
    const out = projectDay({
      day: sampleDay,
      settings: sampleSettings,
      actuals: [bottle(1, "07:05", 5)],
    });
    expect(out.find((e) => e.eventKey === "bottle_1")?.source).toBe("actual");
    expect(out.find((e) => e.eventKey === "bottle_2")?.source).toBe("projected");
  });

  it("applies a template to nap owners", () => {
    const out = projectDay({
      day: sampleDay,
      settings: sampleSettings,
      actuals: [],
      template: saturdayTemplate,
    });
    expect(out.find((e) => e.eventKey === "nap_1")?.owner).toBe("Kelly");
  });

  it("returns sorted by startTime", () => {
    const out = projectDay({ day: sampleDay, settings: sampleSettings, actuals: [] });
    for (let i = 1; i < out.length; i++) {
      expect(out[i]!.startTime >= out[i - 1]!.startTime).toBe(true);
    }
  });

  it("handles overlap: bottle projected during a nap moves to nearest boundary", () => {
    // Force a contrived overlap by giving Bottle 1 a time that produces Bottle 2 inside Nap 1
    // Bottle 1 at 06:30 with 4oz (150 min) → Bottle 2 projected 09:00 → exactly Nap 1 start (09:00–10:00)
    // Should snap to 09:00 (start) since that's not before now (now defaults to end of day)
    const out = projectDay({
      day: sampleDay,
      settings: sampleSettings,
      actuals: [bottle(1, "06:30", 4)],
    });
    const b2 = out.find((e) => e.eventKey === "bottle_2");
    expect(b2?.startTime).toBe("09:00");
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm test src/domain/project.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement `src/domain/project.ts`**

```ts
import type { Event, ProjectInput } from "./types";
import { projectNapChain } from "./napChain";
import { applyNapActuals } from "./napActuals";
import { applyBedtime } from "./bedtime";
import { addPutdownEvents } from "./putdown";
import { projectBottleChain } from "./bottleChain";
import { resolveBottleNapOverlap } from "./bottleOverlap";
import { suppressBottlesAfterBedtime } from "./bottleSuppress";
import { addDreamFeed } from "./dreamFeed";
import { mergePumpsAndExtras } from "./extras";
import { applyTemplate } from "./owners";
import { parseTime } from "./time";

export function projectDay(input: ProjectInput): Event[] {
  const { day, settings, actuals, template, nowMinutes = 24 * 60 } = input;

  // 1. Base nap chain from wake time
  let events: Event[] = projectNapChain(day, settings);

  // 2. Apply nap actuals + short-nap adjustment
  events = applyNapActuals(events, actuals, settings);

  // 3. Substitute bedtime for late naps
  events = applyBedtime(events, settings);

  // 4. Generate putdown events for remaining projected naps
  events = addPutdownEvents(events, settings);

  // 5. Bottle chain from latest bottle actual
  const bottles = projectBottleChain(actuals, settings, day);
  events = [...events, ...bottles];

  // 6. Resolve bottle/nap overlap and re-anchor
  events = resolveBottleNapOverlap(events, settings, day, nowMinutes);

  // 7. Suppress projected bottles past bedtime
  events = suppressBottlesAfterBedtime(events, settings);

  // 8. Dream feed
  events = addDreamFeed(events, settings, day);

  // 9. Pumps + extras
  events = mergePumpsAndExtras(events, actuals, settings, day);

  // 10. Apply ownership template (last, so it sees putdown + final nap shape)
  if (template) events = applyTemplate(events, template);

  return events.sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));
}
```

- [ ] **Step 4: Run test to confirm pass**

```bash
pnpm test src/domain/project.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Run full domain suite to confirm no regressions**

```bash
pnpm test src/domain
```

Expected: all tests across the 14 domain files pass.

- [ ] **Step 6: Commit**

```bash
git add src/domain/project.ts src/domain/project.test.ts
git commit -m "feat(domain): projectDay composes the full scheduling pipeline"
```

---

## Task 16: Dashboard selectors

**Files:**
- Create: `src/domain/selectors.ts`, `src/domain/selectors.test.ts`

PRD Dashboard needs: primary next event, next bottle, next nap, current wake window, projected bedtime.

- [ ] **Step 1: Write failing tests**

Create `src/domain/selectors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  nextEvent,
  nextBottle,
  nextNap,
  currentWakeWindow,
  projectedBedtime,
} from "./selectors";
import { projectDay } from "./project";
import { sampleSettings, sampleDay } from "./__fixtures__/sample";
import { parseTime } from "./time";

const projected = projectDay({ day: sampleDay, settings: sampleSettings, actuals: [] });

describe("nextEvent", () => {
  it("returns the first event whose startTime > now (excluding wake_window)", () => {
    const result = nextEvent(projected, parseTime("08:30"));
    // 08:30 → next non-wake-window event is putdown for Nap 1 at 08:45
    expect(result?.startTime).toBe("08:45");
    expect(result?.type).toBe("putdown");
  });

  it("returns undefined when day is over", () => {
    expect(nextEvent(projected, parseTime("23:59"))).toBeUndefined();
  });
});

describe("nextBottle", () => {
  it("returns the next projected or actual bottle whose start ≥ now", () => {
    const events = projected.concat([
      {
        id: "b2",
        dayId: sampleDay.id,
        eventKey: "bottle_2",
        type: "bottle",
        label: "Bottle 2",
        startTime: "11:05",
        amountOz: 5,
        source: "projected",
        status: "projected",
      },
    ]);
    const result = nextBottle(events, parseTime("09:00"));
    expect(result?.startTime).toBe("11:05");
  });

  it("returns undefined when no bottle after now", () => {
    expect(nextBottle(projected, parseTime("23:00"))).toBeUndefined();
  });
});

describe("nextNap", () => {
  it("returns the next nap whose start ≥ now", () => {
    const result = nextNap(projected, parseTime("10:00"));
    expect(result?.startTime).toBe("12:15"); // Nap 2
  });
});

describe("currentWakeWindow", () => {
  it("returns the wake window containing now", () => {
    const result = currentWakeWindow(projected, parseTime("08:00"));
    expect(result?.eventKey).toBe("wake_window_1");
  });

  it("returns undefined when in a nap", () => {
    expect(currentWakeWindow(projected, parseTime("09:30"))).toBeUndefined();
  });
});

describe("projectedBedtime", () => {
  it("returns the bedtime startTime when present", () => {
    expect(projectedBedtime(projected)).toBe("19:00");
  });

  it("returns undefined when none projected", () => {
    expect(projectedBedtime([])).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm test src/domain/selectors.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement `src/domain/selectors.ts`**

```ts
import type { Event } from "./types";
import { parseTime } from "./time";

export function nextEvent(events: Event[], nowMinutes: number): Event | undefined {
  // Wake windows are visible but they're not the "next thing to do"
  return events
    .filter((e) => e.type !== "wake_window" && parseTime(e.startTime) > nowMinutes)
    .sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime))[0];
}

export function nextBottle(events: Event[], nowMinutes: number): Event | undefined {
  return events
    .filter((e) => e.type === "bottle" && parseTime(e.startTime) >= nowMinutes)
    .sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime))[0];
}

export function nextNap(events: Event[], nowMinutes: number): Event | undefined {
  return events
    .filter((e) => e.type === "nap" && parseTime(e.startTime) >= nowMinutes)
    .sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime))[0];
}

export function currentWakeWindow(events: Event[], nowMinutes: number): Event | undefined {
  return events.find(
    (e) =>
      e.type === "wake_window" &&
      e.endTime !== undefined &&
      parseTime(e.startTime) <= nowMinutes &&
      nowMinutes < parseTime(e.endTime),
  );
}

export function projectedBedtime(events: Event[]): string | undefined {
  return events.find((e) => e.type === "bedtime")?.startTime;
}
```

- [ ] **Step 4: Run test to confirm pass**

```bash
pnpm test src/domain/selectors.test.ts
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/domain/selectors.ts src/domain/selectors.test.ts
git commit -m "feat(domain): dashboard selectors (nextEvent, nextBottle, nextNap, ...)"
```

---

## Task 17: Coverage check + barrel export

**Files:**
- Create: `src/domain/index.ts`

- [ ] **Step 1: Run coverage**

```bash
pnpm test:coverage
```

Expected: HTML report under `coverage/`. Branch coverage on `src/domain/**` should be ≥ 90%. If under, add tests for the missed branches reported by the run.

- [ ] **Step 2: Create barrel export `src/domain/index.ts`**

```ts
export * from "./types";
export { parseTime, formatTime, addMinutes, diffMinutes, clampTime } from "./time";
export { intervalForAmount } from "./bottleRules";
export { projectNapChain } from "./napChain";
export { applyNapActuals } from "./napActuals";
export { applyBedtime } from "./bedtime";
export { addPutdownEvents } from "./putdown";
export { projectBottleChain } from "./bottleChain";
export { resolveBottleNapOverlap } from "./bottleOverlap";
export { suppressBottlesAfterBedtime } from "./bottleSuppress";
export { addDreamFeed } from "./dreamFeed";
export { mergePumpsAndExtras } from "./extras";
export { applyTemplate, flipTemplate, copyToOtherDay } from "./owners";
export { projectDay } from "./project";
export {
  nextEvent,
  nextBottle,
  nextNap,
  currentWakeWindow,
  projectedBedtime,
} from "./selectors";
```

- [ ] **Step 3: Verify typecheck and full suite**

```bash
pnpm typecheck && pnpm test
```

Expected: both exit 0; all domain tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/domain/index.ts
git commit -m "feat(domain): barrel export for the scheduling engine"
```

---

## Done when

- All 16 task suites pass under `pnpm test`.
- Branch coverage on `src/domain/**` ≥ 90%.
- `projectDay()` composes a complete day from `Settings` + `Day` + actuals (+ optional template).
- Engine has zero React/Firebase/DOM imports.
- Barrel export at `src/domain/index.ts` makes the public API consumable as `import { projectDay } from "@/domain"`.

## Out of scope (deferred to data-layer plan)

- Firestore persistence of `Settings`, `Day`, `Event`.
- Realtime listeners.
- "Start New Day" archive transition.
- Auth.
- Any UI.

These are implemented in `docs/2026-MM-DD-data-layer.md` (written after this plan executes).
