/**
 * Converter unit tests — exercises converter functions directly with mock
 * snapshots. Integration tests in days.test.ts cover the same converters via
 * a real Firestore emulator.
 */

import { describe, expect, it } from "vitest";
import type { QueryDocumentSnapshot } from "firebase/firestore";
import type { Day, Event } from "../schemas";
import { NO_OWNER } from "../schemas";
import { v3DayConverter, v3EventConverter, v3SettingsConverter } from "./converters";

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
      suppressedDreamFeed: false,
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

describe("v3SettingsConverter", () => {
  it("fromFirestore on a partial settings doc applies withV3SettingsDefaults", () => {
    const partial = { childId: "c-1", defaultWakeTime: 7 * 60 };
    const back = v3SettingsConverter.fromFirestore(mockSnap(partial));
    // Explicitly-written field preserved.
    expect(back.defaultWakeTime).toBe(7 * 60);
    // Defaulter fills nested shapes that were absent in the raw doc.
    expect(back.bottleChain).toEqual({ bufferAfterWakeMinutes: 10 });
    expect(back.daycare.enabled).toBe(false);
    expect(back.owners.parent1.displayName).toBe("");
    expect(back.wakeWindowsMinutes).toEqual([95, 100, 110, 120, 120, 120]);
  });

  it("toFirestore is a passthrough", () => {
    const partial = { childId: "c-1", defaultWakeTime: 7 * 60 };
    // toFirestore should return exactly what it receives (no modification).
    // Cast to partial to avoid building a complete Settings fixture.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(v3SettingsConverter.toFirestore(partial as any)).toBe(partial);
  });
});

describe("v3EventConverter.toFirestore — realization guard (§F59 / BOTTLE_SPEC §3.1)", () => {
  function evt(id: string): Event {
    return {
      id,
      dayId: "d-1",
      eventKey: "nap_1",
      type: "nap",
      kind: "block",
      label: "Nap 1",
      startTime: 9 * 60,
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "recorded", annotatedAt: 9 * 60 },
    };
  }

  it("throws rather than persist an unrealized projection (proj_ id)", () => {
    expect(() => v3EventConverter.toFirestore(evt("proj_nap_1"))).toThrow(/unrealized projection/i);
  });

  it("passes a realized recorded-doc id straight through", () => {
    const realized = evt("recorded_nap_1");
    expect(v3EventConverter.toFirestore(realized)).toBe(realized);
  });
});
