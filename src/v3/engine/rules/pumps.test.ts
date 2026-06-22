/** R9.x — Pump rules. */

import { describe, expect, it } from "vitest";
import { aContext, aDay, aSettings } from "../../__tests__/factories";
import type { Event } from "../../schemas";
import { NO_OWNER } from "../../schemas";
import type { Rule } from "../evaluator";
import { projectDay } from "../projectDay";
import { RULES as PUMP_RULES } from "./pumps";

const ALL: Rule[] = [...PUMP_RULES];

function aRecordedPump(start: number, eventKey: string, durationMin = 25): Event {
  return {
    id: `actual_${eventKey}`,
    dayId: "day_test",
    eventKey,
    type: "pump",
    kind: "block",
    startTime: start,
    endTime: start + durationMin,
    label: "Pump",
    hasPutdown: false,
    owner: NO_OWNER,
    lifecycle: { state: "completed", committedAt: start },
  };
}

describe("R9.1 / R9.3 — pumps from settings.pumpTimes, first anchored to wakeTime", () => {
  it("with pumpTimes=[10:30, 14:30] and wakeTime=7:00, projects at 7:00 and 14:30", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        pumpTimes: [{ time: 10 * 60 + 30 }, { time: 14 * 60 + 30 }],
        pumpOwnerSlot: "parent2",
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
      { rules: ALL },
    );

    const pumps = out.filter((e) => e.type === "pump").sort((a, b) => a.startTime - b.startTime);

    expect(pumps).toHaveLength(2);
    expect(pumps[0]!.startTime).toBe(7 * 60); // first anchored to wake
    expect(pumps[1]!.startTime).toBe(14 * 60 + 30);
    // Pumps are duration blocks: kind=block + endTime = start + default duration.
    expect(pumps.every((p) => p.kind === "block")).toBe(true);
    const dur = ctx.settings.defaultPumpDurationMinutes;
    expect(pumps[0]!.endTime).toBe(7 * 60 + dur);
    expect(pumps[1]!.endTime).toBe(14 * 60 + 30 + dur);
    // 7:00 < nowMinutes=12:00 → recorded; 14:30 > 12:00 → projected (ADR-0006 Now-cross).
    expect(
      pumps.every((p) =>
        p.startTime <= ctx.nowMinutes
          ? p.lifecycle.state === "recorded"
          : p.lifecycle.state === "projected",
      ),
    ).toBe(true);
    expect(pumps.every((p) => p.owner !== undefined && p.owner.slot === "parent2")).toBe(true);
  });
});

describe("R9.4 — actual pump replaces projected at same eventKey", () => {
  it("with an actual pump at 07:00, the projected 07:00 is suppressed (no duplicate)", () => {
    // Settings put pumps at [10:30, 14:30]; R9.3 retargets the first to
    // 7:00. An actual pump at eventKey "pump_07:00" should suppress the
    // projection.
    const recorded = aRecordedPump(7 * 60, "pump_07:00");

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        pumpTimes: [{ time: 10 * 60 + 30 }, { time: 14 * 60 + 30 }],
        pumpOwnerSlot: "parent2",
      }),
      actuals: [recorded],
    });

    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: ALL },
    );

    const pumps = out.filter((e) => e.type === "pump");
    expect(pumps).toHaveLength(2); // recorded 7:00 + projected 14:30
    const sevenAm = pumps.filter((p) => p.startTime === 7 * 60);
    expect(sevenAm).toHaveLength(1);
    expect(sevenAm[0]!.id).toBe(recorded.id); // the recorded one wins
    expect(sevenAm[0]!.lifecycle.state).toBe("completed");
  });
});

describe("R9.1 — eventKey deduplication across collisions", () => {
  it("collapses pump targets that share an eventKey (duplicate settings or wake==entry)", () => {
    // Two collision cases in one scenario:
    //   - Settings entry [9:00] equals wakeTime 9:00 → both want eventKey 'pump_09:00'.
    //   - Settings has 14:30 listed twice → second wants the same eventKey.
    // Expected: one pump at 09:00, one at 14:30. No dup ids, no dup keys.
    const ctx = aContext({
      day: aDay({ wakeTime: 9 * 60 }),
      settings: aSettings({
        pumpTimes: [{ time: 9 * 60 }, { time: 14 * 60 + 30 }, { time: 14 * 60 + 30 }],
        pumpOwnerSlot: "parent2",
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
      { rules: ALL },
    );

    const pumps = out.filter((e) => e.type === "pump");
    expect(pumps).toHaveLength(2);
    expect(new Set(pumps.map((p) => p.id)).size).toBe(2);
    expect(new Set(pumps.map((p) => p.eventKey)).size).toBe(2);
    expect(pumps.map((p) => p.startTime).sort((a, b) => a - b)).toEqual([9 * 60, 14 * 60 + 30]);
  });
});

describe("R9.4 — reality wins: a projected pump never lands on a manually-entered pump block", () => {
  it("a manually-added pump block (uuid key) suppresses the wake-anchored projection that overlaps it", () => {
    // Kelly adds a pump session at wake (uuid eventKey, so the time-based dedup
    // never matches it), then the wake-anchored first pump re-projects on top.
    // Reality wins: the manual block stays, the overlapping projection is dropped.
    const manual = aRecordedPump(7 * 60, "pump_abc123uuid");

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 + 10 }),
      settings: aSettings({
        pumpTimes: [{ time: 6 * 60 }, { time: 10 * 60 }],
        pumpOwnerSlot: "parent2",
      }),
      actuals: [manual],
    });

    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: ALL },
    );

    const morningPumps = out.filter((e) => e.type === "pump" && e.startTime < 10 * 60);
    expect(morningPumps).toHaveLength(1);
    expect(morningPumps[0]!.id).toBe(manual.id);
  });

  it("a scheduled pump starting exactly when a committed block ends is not suppressed (half-open)", () => {
    // Committed block 7:00–7:25; the next scheduled pump at 7:25 abuts it.
    // Back-to-back sessions are distinct — adjacency must not count as overlap.
    // (First entry 7:00 anchors to wake and is itself suppressed by the manual block.)
    const manual = aRecordedPump(7 * 60, "pump_uuid_abuts", 25);

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        pumpTimes: [{ time: 7 * 60 }, { time: 7 * 60 + 25 }, { time: 11 * 60 }],
        pumpOwnerSlot: "parent2",
        defaultPumpDurationMinutes: 25,
      }),
      actuals: [manual],
    });

    const out = projectDay(
      { day: ctx.day, settings: ctx.settings, actuals: ctx.actuals, nowMinutes: ctx.nowMinutes },
      { rules: ALL },
    );

    const pumpStarts = out
      .filter((e) => e.type === "pump")
      .map((p) => p.startTime)
      .sort((a, b) => a - b);
    // manual 7:00 + adjacent 7:25 (survives) + 11:00.
    expect(pumpStarts).toEqual([7 * 60, 7 * 60 + 25, 11 * 60]);
  });

  it("a short-duration candidate whose block ends before a committed block survives", () => {
    // Second entry at 9:30 with an explicit 10-min duration ends at 9:40, before the
    // committed 9:45–10:10 block — no overlap (the default 25-min duration WOULD overlap),
    // so it must not be suppressed.
    const manual = aRecordedPump(9 * 60 + 45, "pump_uuid_late", 25);

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        pumpTimes: [{ time: 7 * 60 }, { time: 9 * 60 + 30, durationMinutes: 10 }],
        pumpOwnerSlot: "parent2",
      }),
      actuals: [manual],
    });

    const out = projectDay(
      { day: ctx.day, settings: ctx.settings, actuals: ctx.actuals, nowMinutes: ctx.nowMinutes },
      { rules: ALL },
    );

    const pumpStarts = out
      .filter((e) => e.type === "pump")
      .map((p) => p.startTime)
      .sort((a, b) => a - b);
    expect(pumpStarts).toEqual([7 * 60, 9 * 60 + 30, 9 * 60 + 45]);
  });

  it("a manual pump that does not overlap any projection leaves the scheduled pumps intact", () => {
    // Manual overnight pump at 3:00 must NOT suppress the 6:00→wake morning pump.
    const manual = aRecordedPump(3 * 60, "pump_overnight_uuid");

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        pumpTimes: [{ time: 6 * 60 }, { time: 10 * 60 }],
        pumpOwnerSlot: "parent2",
      }),
      actuals: [manual],
    });

    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: ALL },
    );

    const pumpStarts = out
      .filter((e) => e.type === "pump")
      .map((p) => p.startTime)
      .sort((a, b) => a - b);
    // overnight 3:00 (manual) + 7:00 (wake-anchored) + 10:00 scheduled.
    expect(pumpStarts).toEqual([3 * 60, 7 * 60, 10 * 60]);
  });
});

describe("R9.1 — empty pumpTimes emits nothing", () => {
  it("no pumps in settings → no pump events emitted", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({ pumpTimes: [] }),
      actuals: [],
    });

    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: ALL },
    );

    expect(out.filter((e) => e.type === "pump")).toHaveLength(0);
  });
});
