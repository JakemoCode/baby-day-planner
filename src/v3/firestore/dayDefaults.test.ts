/**
 * V3 Day defensive defaults — fills `suppressedRecurringIds` (default
 * `[]`) and `suppressedDaycareDay` (default `false`) on read so the
 * engine doesn't crash on `undefined.includes`. V2 bridge removed in
 * PR-C1.
 */

import { describe, expect, it } from "vitest";
import type { Day } from "../schemas";
import { withV3DayDefaults } from "./dayDefaults";

describe("withV3DayDefaults", () => {
  it("passes through a fully-shaped V3 day unchanged", () => {
    const v3: Day = {
      id: "d-1",
      childId: "child-1",
      date: "2026-05-09",
      status: "active",
      wakeTime: 7 * 60 + 30,
      suppressedRecurringIds: ["recurring-1"],
      suppressedDaycareDay: true,
      suppressedDreamFeed: false,
      templateId: "tpl-saturday",
    };
    expect(withV3DayDefaults(v3)).toEqual(v3);
  });

  it("returns null for null input (lets the hook stay loading)", () => {
    expect(withV3DayDefaults(null)).toBeNull();
  });

  it("fills missing suppressedRecurringIds with empty array", () => {
    const out = withV3DayDefaults({
      id: "d-1",
      childId: "child-1",
      date: "2026-05-09",
      status: "active",
    });
    expect(out!.suppressedRecurringIds).toEqual([]);
  });

  it("fills missing suppressedDaycareDay with false", () => {
    const out = withV3DayDefaults({
      id: "d-1",
      childId: "child-1",
      date: "2026-05-09",
      status: "active",
    });
    expect(out!.suppressedDaycareDay).toBe(false);
  });

  it("preserves caller-supplied suppressedRecurringIds", () => {
    const out = withV3DayDefaults({
      id: "d-1",
      childId: "child-1",
      date: "2026-05-09",
      status: "active",
      suppressedRecurringIds: ["dinner"],
    });
    expect(out!.suppressedRecurringIds).toEqual(["dinner"]);
  });

  it("preserves caller-supplied suppressedDaycareDay", () => {
    const out = withV3DayDefaults({
      id: "d-1",
      childId: "child-1",
      date: "2026-05-09",
      status: "active",
      suppressedDaycareDay: true,
    });
    expect(out!.suppressedDaycareDay).toBe(true);
  });

  // V2 ownershipTemplateId remap tests removed in PR-C1 (V2 surface deleted).

  it("does not invent templateId when neither field is present", () => {
    const out = withV3DayDefaults({
      id: "d-1",
      childId: "child-1",
      date: "2026-05-09",
      status: "active",
    });
    expect("templateId" in out!).toBe(false);
  });

  it("preserves wakeTime when present (TimeMin number)", () => {
    const out = withV3DayDefaults({
      id: "d-1",
      childId: "child-1",
      date: "2026-05-09",
      status: "active",
      wakeTime: 7 * 60 + 30,
    });
    expect(out!.wakeTime).toBe(7 * 60 + 30);
  });

  it("does not invent wakeTime when absent (V3 schema allows undefined)", () => {
    const out = withV3DayDefaults({
      id: "d-1",
      childId: "child-1",
      date: "2026-05-09",
      status: "active",
    });
    expect("wakeTime" in out!).toBe(false);
  });

  it("preserves status across all valid values", () => {
    for (const status of ["planned", "active", "archived"] as const) {
      const out = withV3DayDefaults({
        id: "d-1",
        childId: "child-1",
        date: "2026-05-09",
        status,
      });
      expect(out!.status).toBe(status);
    }
  });
});
