/**
 * V3 Day → V2 Day back-compat shim tests.
 *
 * Phase B transition: V3 startNewDay writes V3-shape day docs (TimeMin
 * wakeTime, templateId, no createdAt). V2 useDay still reads them and
 * expects V2 shape (HH:MM string wakeTime, ownershipTemplateId,
 * required createdAt).
 */

import { describe, expect, it } from "vitest";
import type { Day as V2Day } from "@/domain";
import { withV2DayBackcompat } from "./v2Backcompat";

describe("withV2DayBackcompat", () => {
  it("converts V3 TimeMin wakeTime to V2 HH:MM string", () => {
    const v3 = {
      id: "day-1",
      childId: "child-1",
      date: "2026-05-09",
      status: "active" as const,
      wakeTime: 7 * 60 + 15, // 7:15
      suppressedRecurringIds: [],
      suppressedDaycareDay: false,
    };
    const out = withV2DayBackcompat(v3);
    expect(out?.wakeTime).toBe("07:15");
  });

  it("renames V3 templateId to V2 ownershipTemplateId", () => {
    const v3 = {
      id: "day-1",
      childId: "child-1",
      date: "2026-05-09",
      status: "active" as const,
      templateId: "tpl-saturday",
      suppressedRecurringIds: [],
      suppressedDaycareDay: false,
    };
    const out = withV2DayBackcompat(v3);
    expect(out?.ownershipTemplateId).toBe("tpl-saturday");
  });

  it("synthesizes createdAt from day.date when missing", () => {
    const v3 = {
      id: "day-1",
      childId: "child-1",
      date: "2026-05-09",
      status: "active" as const,
      suppressedRecurringIds: [],
      suppressedDaycareDay: false,
    };
    const out = withV2DayBackcompat(v3);
    expect(out?.createdAt).toBe("2026-05-09T00:00:00Z");
  });

  it("passes already-V2 doc through with wakeTime as string", () => {
    const v2: V2Day = {
      id: "day-1",
      childId: "child-1",
      date: "2026-05-09",
      status: "active",
      wakeTime: "07:15",
      ownershipTemplateId: "tpl-saturday",
      createdAt: "2026-05-09T08:00:00Z",
    };
    const out = withV2DayBackcompat(v2);
    expect(out?.wakeTime).toBe("07:15");
    expect(out?.ownershipTemplateId).toBe("tpl-saturday");
    expect(out?.createdAt).toBe("2026-05-09T08:00:00Z");
  });

  it("returns null when input is null", () => {
    expect(withV2DayBackcompat(null)).toBeNull();
  });
});
