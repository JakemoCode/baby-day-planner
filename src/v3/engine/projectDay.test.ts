import { describe, expect, it } from "vitest";
import { aContext, aRecordedBottle, aRecordedNap } from "../__tests__/factories";
import type { Rule } from "./evaluator";
import { projectDay } from "./projectDay";

describe("projectDay", () => {
  it("with an empty rule set, returns actuals sorted by startTime", () => {
    const ctx = aContext({
      actuals: [aRecordedNap({ start: 13 * 60, end: 14 * 60 }), aRecordedBottle({ start: 9 * 60 })],
    });
    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: [] },
    );
    expect(out.map((e) => e.startTime)).toEqual([9 * 60, 13 * 60]);
  });

  it("applies a custom rule set when supplied (test escape hatch)", () => {
    const labelRule: Rule = {
      id: "R.label",
      description: "rename naps for display",
      matches: (events) => events.some((e) => e.type === "nap" && e.label !== "Nap"),
      produces: (events) => events.map((e) => (e.type === "nap" ? { ...e, label: "Nap" } : e)),
    };
    const ctx = aContext({
      actuals: [aRecordedNap({ start: 13 * 60, end: 14 * 60 })],
    });
    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: [labelRule] },
    );
    expect(out[0]!.label).toBe("Nap");
  });

  it("defaults nowMinutes to end-of-day when caller doesn't pass it", () => {
    // Probe via a custom rule that captures nowMinutes from context.
    let observedNow: number | null = null;
    const probe: Rule = {
      id: "R.probe",
      description: "captures nowMinutes once",
      matches: () => observedNow === null,
      produces: (events, ctx) => {
        observedNow = ctx.nowMinutes;
        return events;
      },
    };
    const ctx = aContext();
    projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: [],
      },
      { rules: [probe] },
    );
    expect(observedNow).toBe(24 * 60);
  });
});
