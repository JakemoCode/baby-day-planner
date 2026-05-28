/**
 * Seam coverage: engine output invariants per (event type, lifecycle state).
 * §0 reality-wins (lifecycle never mutates) and R6.1 hasPutdown derivation.
 */

import { describe, expect, it } from "vitest";
import { aContext, aDay, aSettings } from "./factories";
import { projectDay } from "../engine/projectDay";
import type { Event, EventType, Lifecycle } from "../schemas";
import { NO_OWNER } from "../schemas";

type Cell = {
  type: EventType;
  state: Lifecycle["state"];
  expectedHasPutdown: boolean;
};

// Every event type × lifecycle state. wake_window omitted — always projected (R3.1), never recorded.
const CELLS: Cell[] = [
  // Naps: putdown applies to projected / recorded only.
  { type: "nap", state: "projected", expectedHasPutdown: true },
  { type: "nap", state: "recorded", expectedHasPutdown: true },
  { type: "nap", state: "completed", expectedHasPutdown: false },
  // Bedtime: same gate as naps.
  { type: "bedtime", state: "projected", expectedHasPutdown: true },
  { type: "bedtime", state: "recorded", expectedHasPutdown: true },
  { type: "bedtime", state: "completed", expectedHasPutdown: false },
  // Bottles never have putdown.
  { type: "bottle", state: "projected", expectedHasPutdown: false },
  { type: "bottle", state: "recorded", expectedHasPutdown: false },
  { type: "bottle", state: "completed", expectedHasPutdown: false },
  // Extras never have putdown (no nap/bedtime semantics).
  { type: "extra", state: "projected", expectedHasPutdown: false },
  { type: "extra", state: "recorded", expectedHasPutdown: false },
  { type: "extra", state: "completed", expectedHasPutdown: false },
];

function lifecycleOf(state: Lifecycle["state"], when: number): Lifecycle {
  switch (state) {
    case "projected":
      return { state: "projected" };
    case "recorded":
      return { state: "recorded", annotatedAt: when };
    case "completed":
      return { state: "completed", committedAt: when };
  }
}

function buildEvent(type: EventType, state: Lifecycle["state"], when: number): Event {
  const isBlock = type === "nap" || type === "bedtime" || type === "extra";
  const event: Event = {
    id: `actual_${type}_${state}`,
    dayId: "day_test",
    eventKey: type === "bedtime" ? "bedtime" : `${type}_1`,
    type,
    kind: isBlock ? "block" : "instant",
    startTime: when,
    label: `${type} ${state}`,
    // Seed false so we verify the engine rule fires, not just passes input through.
    hasPutdown: false,
    owner: NO_OWNER,
    lifecycle: lifecycleOf(state, when),
  };
  if (isBlock) event.endTime = when + 60;
  return event;
}

describe("Engine invariants per (event type, lifecycle state)", () => {
  for (const cell of CELLS) {
    it(`(${cell.type}, ${cell.state}) → hasPutdown=${cell.expectedHasPutdown}, lifecycle preserved`, () => {
      const startTime = 13 * 60; // mid-afternoon, well-defined for all event types
      const seeded = buildEvent(cell.type, cell.state, startTime);

      const ctx = aContext({
        day: aDay({ wakeTime: 7 * 60 }),
        settings: aSettings({
          // Keep cascade output minimal so we can isolate the seeded event.
          wakeWindowsMinutes: [],
          bottleChain: { bottlesPerDay: 0, bufferAfterWakeMinutes: 10 },
          bedtimeThreshold: 23 * 60,
        }),
        actuals: [seeded],
        nowMinutes: 12 * 60,
      });

      const out = projectDay({
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      });

      const emitted = out.find((e) => e.id === seeded.id);
      expect(emitted, `seeded event lost from output`).toBeDefined();

      // Reality-wins (§0): lifecycle never mutates.
      expect(emitted!.lifecycle).toEqual(seeded.lifecycle);

      // R6.1: hasPutdown matches the gate.
      expect(emitted!.hasPutdown).toBe(cell.expectedHasPutdown);
    });
  }
});
