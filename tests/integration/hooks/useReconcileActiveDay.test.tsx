// @vitest-environment jsdom
/**
 * Integration test: useReconcileActiveDay hook (§F17 PR 2)
 *
 * Exercises the rollover seam end-to-end: real Firestore emulator → real
 * days + tomorrowPlans repos → useReconcileActiveDay hook → resulting
 * Day doc. No business-logic mocks; only the Firebase singleton is
 * swapped for the emulator-backed db (legitimate infra-boundary mock).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import { ALLOWED_USER, seedAllowedUser, startTestEnv } from "../firestore-test-utils";
import { createDay, getDay } from "../../../src/v3/repositories/days";
import { loadTomorrowPlan, saveTomorrowPlan } from "../../../src/v3/repositories/tomorrowPlans";
import type { Day, TomorrowPlan } from "../../../src/v3/schemas";
import { useReconcileActiveDay } from "../../../src/v3/hooks/useReconcileActiveDay";

let testDb: Firestore;

vi.mock("@/lib/firebase/client", () => ({
  get db() {
    return testDb;
  },
}));

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await startTestEnv();
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seedAllowedUser(env, ALLOWED_USER.uid, ["child-1"]);
  const ctx = env.authenticatedContext(ALLOWED_USER.uid, { email: ALLOWED_USER.email });
  testDb = ctx.firestore() as unknown as Firestore;
});

const TODAY = "2026-05-21";
const DEFAULT_WAKE = 7 * 60;

const todaysActiveDay: Day = {
  id: "day-child-1-2026-05-21",
  childId: "child-1",
  date: TODAY,
  status: "active",
  wakeTime: 7 * 60,
  suppressedRecurringIds: [],
  suppressedDaycareDay: false,
};

const yesterdaysActiveDay: Day = {
  id: "day-yesterday",
  childId: "child-1",
  date: "2026-05-20",
  status: "active",
  wakeTime: 7 * 60,
  suppressedRecurringIds: [],
  suppressedDaycareDay: false,
};

const aPlan = (overrides: Partial<TomorrowPlan> = {}): TomorrowPlan => ({
  childId: "child-1",
  date: TODAY,
  status: "draft",
  ownerOverrides: {},
  extras: [],
  ...overrides,
});

describe("useReconcileActiveDay (emulator-backed)", () => {
  // Slice F
  it("promotes today from settings defaults when no active day exists", async () => {
    const { result } = renderHook(() => useReconcileActiveDay("child-1", TODAY, DEFAULT_WAKE));

    await waitFor(() => {
      expect(result.current.done).toBe(true);
    });

    // Day-child-1-2026-05-21 now exists with defaults
    const created = await getDay(testDb, "child-1", "day-child-1-2026-05-21");
    expect(created?.status).toBe("active");
    expect(created?.date).toBe(TODAY);
    expect(created?.wakeTime).toBe(DEFAULT_WAKE);
    // No template, no overrides — pure defaults path
    expect(created?.templateId).toBeUndefined();
    expect(created?.ownerOverrides).toBeUndefined();
  });

  // Slice G
  it("promotes from confirmed TomorrowPlan when one exists for today", async () => {
    await saveTomorrowPlan(
      testDb,
      "child-1",
      aPlan({
        status: "confirmed",
        wakeTime: 6 * 60 + 30,
        ownerOverrides: { nap_1: { slot: "parent1" } },
        startTemplateId: "tpl-saturday",
      }),
    );

    const { result } = renderHook(() => useReconcileActiveDay("child-1", TODAY, DEFAULT_WAKE));

    await waitFor(() => {
      expect(result.current.done).toBe(true);
    });

    const created = await getDay(testDb, "child-1", "day-child-1-2026-05-21");
    expect(created?.wakeTime).toBe(6 * 60 + 30);
    expect(created?.templateId).toBe("tpl-saturday");
    expect(created?.ownerOverrides).toEqual({ nap_1: { slot: "parent1" } });
  });

  // Slice I
  it("ignores DRAFT plans (does NOT auto-promote them)", async () => {
    await saveTomorrowPlan(
      testDb,
      "child-1",
      aPlan({
        status: "draft", // unconfirmed
        wakeTime: 6 * 60 + 30,
        startTemplateId: "tpl-saturday",
      }),
    );

    const { result } = renderHook(() => useReconcileActiveDay("child-1", TODAY, DEFAULT_WAKE));

    await waitFor(() => {
      expect(result.current.done).toBe(true);
    });

    // Defaults path was taken — draft was ignored
    const created = await getDay(testDb, "child-1", "day-child-1-2026-05-21");
    expect(created?.wakeTime).toBe(DEFAULT_WAKE);
    expect(created?.templateId).toBeUndefined();

    // Plan still exists as draft for future re-confirm
    const plan = await loadTomorrowPlan(testDb, "child-1", TODAY);
    expect(plan?.status).toBe("draft");
  });

  // Slice H
  it("archives a stale active day before creating today's", async () => {
    await createDay(testDb, yesterdaysActiveDay);

    const { result } = renderHook(() => useReconcileActiveDay("child-1", TODAY, DEFAULT_WAKE));

    await waitFor(() => {
      expect(result.current.done).toBe(true);
    });

    const yesterday = await getDay(testDb, "child-1", "day-yesterday");
    expect(yesterday?.status).toBe("archived");
    const today = await getDay(testDb, "child-1", "day-child-1-2026-05-21");
    expect(today?.status).toBe("active");
  });

  // Slice J
  it("deletes stale TomorrowPlans (plan.date < today) during rollover", async () => {
    // A plan dated for the past — should be garbage-collected
    await saveTomorrowPlan(testDb, "child-1", aPlan({ date: "2026-05-19", status: "confirmed" }));
    // A plan dated for a future date — should be left alone
    await saveTomorrowPlan(testDb, "child-1", aPlan({ date: "2026-05-25", status: "draft" }));

    const { result } = renderHook(() => useReconcileActiveDay("child-1", TODAY, DEFAULT_WAKE));

    await waitFor(() => {
      expect(result.current.done).toBe(true);
    });

    const stalePlan = await loadTomorrowPlan(testDb, "child-1", "2026-05-19");
    expect(stalePlan).toBeNull();
    const futurePlan = await loadTomorrowPlan(testDb, "child-1", "2026-05-25");
    expect(futurePlan).not.toBeNull();
  });

  // Slice E
  it("no-ops when active.date === today (no writes, done=true)", async () => {
    await createDay(testDb, todaysActiveDay);

    const { result } = renderHook(() => useReconcileActiveDay("child-1", TODAY, DEFAULT_WAKE));

    await waitFor(() => {
      expect(result.current.done).toBe(true);
    });

    // Same day still active; not re-written
    const stillToday = await getDay(testDb, "child-1", todaysActiveDay.id);
    expect(stillToday?.status).toBe("active");
    expect(stillToday?.date).toBe(TODAY);
  });
});
