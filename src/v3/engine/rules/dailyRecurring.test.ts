/**
 * R11.x — Daily recurring event rules.
 *
 * Tests-first per CLAUDE.md TDD protocol.
 */

import { describe, expect, it } from "vitest";
import { aContext, aDay, aSettings } from "../../__tests__/factories";
import type { Day, Event } from "../../schemas";
import { NO_OWNER } from "../../schemas";
import type { Rule } from "../evaluator";
import { projectDay } from "../projectDay";
import { RULES as DR_RULES } from "./dailyRecurring";

const ALL: Rule[] = [...DR_RULES];

function runWith(
  settingsOverride: Parameters<typeof aSettings>[0],
  extras: { day?: Partial<Day>; actuals?: Event[] } = {},
): Event[] {
  const ctx = aContext({
    day: aDay({ wakeTime: 7 * 60, ...(extras.day ?? {}) }),
    settings: aSettings(settingsOverride),
    actuals: extras.actuals ?? [],
  });
  return projectDay(
    {
      day: ctx.day,
      settings: ctx.settings,
      actuals: ctx.actuals,
      nowMinutes: ctx.nowMinutes,
    },
    { rules: ALL },
  );
}

describe("R11.1 / R11.2 — enabled entries project once each", () => {
  it("instant entry (no duration) emits eventKey recurring:{id}, kind=instant, type=daily_recurring", () => {
    const out = runWith({
      dailyRecurring: [{ id: "cook_dinner", label: "Cook Dinner", time: 17 * 60, enabled: true }],
    });
    const evs = out.filter((e) => e.type === "daily_recurring");
    expect(evs).toHaveLength(1);
    expect(evs[0]!.eventKey).toBe("recurring:cook_dinner");
    expect(evs[0]!.kind).toBe("instant");
    expect(evs[0]!.startTime).toBe(17 * 60);
    expect(evs[0]!.endTime).toBeUndefined();
    expect(evs[0]!.label).toBe("Cook Dinner");
    expect(evs[0]!.lifecycle.state).toBe("projected");
  });

  it("block entry (duration set) emits with endTime = time + durationMinutes, kind=block", () => {
    const out = runWith({
      dailyRecurring: [
        {
          id: "bath",
          label: "Bath",
          time: 18 * 60 + 30,
          durationMinutes: 15,
          enabled: true,
        },
      ],
    });
    const evs = out.filter((e) => e.type === "daily_recurring");
    expect(evs).toHaveLength(1);
    expect(evs[0]!.kind).toBe("block");
    expect(evs[0]!.startTime).toBe(18 * 60 + 30);
    expect(evs[0]!.endTime).toBe(18 * 60 + 45);
  });

  it("defaultOwnerSlot drives the projected event's owner slot", () => {
    const out = runWith({
      dailyRecurring: [
        {
          id: "drop",
          label: "Daycare Dropoff",
          time: 8 * 60 + 30,
          defaultOwnerSlot: "parent1",
          enabled: true,
        },
      ],
    });
    const ev = out.find((e) => e.type === "daily_recurring");
    expect(ev?.owner).toEqual({ slot: "parent1" });
  });

  it("disabled entry emits nothing", () => {
    const out = runWith({
      dailyRecurring: [{ id: "cook_dinner", label: "Cook Dinner", time: 17 * 60, enabled: false }],
    });
    expect(out.filter((e) => e.type === "daily_recurring")).toHaveLength(0);
  });

  it("multiple enabled entries each emit once", () => {
    const out = runWith({
      dailyRecurring: [
        { id: "a", label: "A", time: 10 * 60, enabled: true },
        { id: "b", label: "B", time: 12 * 60, enabled: true },
        { id: "c", label: "C", time: 17 * 60, enabled: false },
      ],
    });
    const keys = out.filter((e) => e.type === "daily_recurring").map((e) => e.eventKey);
    expect(keys.sort()).toEqual(["recurring:a", "recurring:b"]);
  });
});

describe("R11.2 — durationMinutes edge cases", () => {
  it("durationMinutes=0 is treated as instant (zero-length block makes no sense)", () => {
    const out = runWith({
      dailyRecurring: [{ id: "x", label: "X", time: 12 * 60, durationMinutes: 0, enabled: true }],
    });
    const ev = out.find((e) => e.type === "daily_recurring");
    expect(ev).toBeDefined();
    expect(ev!.kind).toBe("instant");
    expect(ev!.endTime).toBeUndefined();
  });
});

describe("R11.1 — duplicate id in settings emits only one event", () => {
  it("two entries with the same id produce a single projection (defensive dedup)", () => {
    const out = runWith({
      dailyRecurring: [
        { id: "dup", label: "First", time: 12 * 60, enabled: true },
        { id: "dup", label: "Second", time: 13 * 60, enabled: true },
      ],
    });
    const evs = out.filter((e) => e.type === "daily_recurring");
    expect(evs).toHaveLength(1);
    // First entry wins (encountered first in the array).
    expect(evs[0]!.label).toBe("First");
    expect(evs[0]!.startTime).toBe(12 * 60);
  });
});

describe("R11.5 — existing event at same eventKey suppresses projection", () => {
  it("a recorded daily_recurring with eventKey recurring:cook_dinner suppresses the projection", () => {
    const recorded: Event = {
      id: "actual_cook",
      dayId: "day_test",
      eventKey: "recurring:cook_dinner",
      type: "daily_recurring",
      kind: "instant",
      startTime: 17 * 60 + 12, // user logged at 17:12, slightly off the 17:00 setting
      label: "Cook Dinner",
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "completed", committedAt: 17 * 60 + 12 },
    };

    const out = runWith(
      {
        dailyRecurring: [{ id: "cook_dinner", label: "Cook Dinner", time: 17 * 60, enabled: true }],
      },
      { actuals: [recorded] },
    );

    const evs = out.filter((e) => e.type === "daily_recurring");
    expect(evs).toHaveLength(1);
    expect(evs[0]!.id).toBe(recorded.id);
    expect(evs[0]!.startTime).toBe(17 * 60 + 12); // recorded time stands (§0)
  });
});

describe("R11.6 — Day.suppressedRecurringIds skips emission for that day", () => {
  it("with suppressedRecurringIds=['cook_dinner'], no projection emits for that id", () => {
    const out = runWith(
      {
        dailyRecurring: [
          { id: "cook_dinner", label: "Cook Dinner", time: 17 * 60, enabled: true },
          { id: "bath", label: "Bath", time: 18 * 60, durationMinutes: 15, enabled: true },
        ],
      },
      { day: { wakeTime: 7 * 60, suppressedRecurringIds: ["cook_dinner"] } },
    );
    const keys = out.filter((e) => e.type === "daily_recurring").map((e) => e.eventKey);
    expect(keys.sort()).toEqual(["recurring:bath"]);
  });
});

describe("R11.7 — empty default emits nothing", () => {
  it("empty dailyRecurring → no events", () => {
    const out = runWith({ dailyRecurring: [] });
    expect(out.filter((e) => e.type === "daily_recurring")).toHaveLength(0);
  });
});
