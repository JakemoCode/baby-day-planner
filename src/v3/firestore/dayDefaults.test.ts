/**
 * V3 Day defensive defaults — bridge V2-shape and partial-V3 day docs
 * into a fully-shaped V3 Day on read so the engine doesn't crash on
 * `undefined.includes` (suppressedRecurringIds) or silently lose
 * template assignment (V2 wrote `ownershipTemplateId`; V3 reads
 * `templateId`).
 *
 * Transitional: the V2 ownershipTemplateId remap deletes in PR-C1
 * once no V2 day docs remain. The defaults filling stays as
 * legitimate optionality.
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

  it("remaps V2 ownershipTemplateId to V3 templateId when V3 field absent", () => {
    const v2 = {
      id: "d-1",
      childId: "child-1",
      date: "2026-05-09",
      status: "active",
      ownershipTemplateId: "tpl-weekday", // V2 field
    } as unknown as Partial<Day>;
    const out = withV3DayDefaults(v2);
    expect(out!.templateId).toBe("tpl-weekday");
  });

  it("V3 templateId takes precedence over V2 ownershipTemplateId when both present", () => {
    const mixed = {
      id: "d-1",
      childId: "child-1",
      date: "2026-05-09",
      status: "active",
      templateId: "tpl-v3",
      ownershipTemplateId: "tpl-v2",
    } as unknown as Partial<Day>;
    const out = withV3DayDefaults(mixed);
    expect(out!.templateId).toBe("tpl-v3");
  });

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
