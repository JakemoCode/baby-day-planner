/**
 * Converter unit tests. The integration tests at
 * `src/v3/repositories/days.test.ts` exercise these via a real
 * Firestore emulator; this file exercises the converter functions
 * directly with mock snapshots so round-trip behavior is provable in
 * the unit suite.
 */

import { describe, expect, it } from "vitest";
import type { QueryDocumentSnapshot } from "firebase/firestore";
import type { Day } from "../schemas";
import { v3DayConverter } from "./converters";

function mockSnap(data: Record<string, unknown>): QueryDocumentSnapshot {
  return {
    data: () => data,
  } as unknown as QueryDocumentSnapshot;
}

describe("v3DayConverter", () => {
  it("round-trips a fully-shaped V3 Day with no field loss", () => {
    const day: Day = {
      id: "d-1",
      childId: "c-1",
      date: "2026-05-09",
      status: "active",
      wakeTime: 7 * 60 + 30,
      suppressedRecurringIds: ["dinner"],
      suppressedDaycareDay: false,
      templateId: "tpl-saturday",
    };
    const wired = v3DayConverter.toFirestore(day) as Record<string, unknown>;
    const back = v3DayConverter.fromFirestore(mockSnap(wired));
    expect(back).toEqual(day);
  });

  // V2-shape converter test removed in PR-C1 (V2 surface deleted).

  it("fromFirestore on a partial-V3 doc fills missing suppression fields", () => {
    const partial = {
      id: "d-1",
      childId: "c-1",
      date: "2026-05-09",
      status: "active",
      wakeTime: 7 * 60 + 30,
    };
    const back = v3DayConverter.fromFirestore(mockSnap(partial));
    expect(back.suppressedRecurringIds).toEqual([]);
    expect(back.suppressedDaycareDay).toBe(false);
    expect(back.wakeTime).toBe(7 * 60 + 30);
  });
});
