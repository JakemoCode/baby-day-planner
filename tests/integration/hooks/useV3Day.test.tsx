// @vitest-environment jsdom
/**
 * Integration test: useV3Day hook — real emulator → real days repo → real subscription.
 * db singleton swapped for emulator-backed db (infra-boundary mock, not business-logic mock).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import { ALLOWED_USER, seedAllowedUser, startTestEnv } from "../firestore-test-utils";
import { createDay } from "../../../src/v3/repositories/days";
import type { Day } from "../../../src/v3/schemas";
import { useV3Day } from "../../../src/v3/hooks/useV3Day";

let testDb: Firestore;

// Getter defers testDb resolution to call time; vi.mock is hoisted above imports.
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

const activeDay: Day = {
  id: "day-1",
  childId: "child-1",
  date: "2026-05-09",
  status: "active",
  wakeTime: 7 * 60,
  suppressedRecurringIds: [],
  suppressedDaycareDay: false,
};

describe("useV3Day (emulator-backed)", () => {
  it("starts in a loading state before any Firestore data arrives", () => {
    const { result } = renderHook(() => useV3Day("child-1"));
    expect(result.current.loading).toBe(true);
    expect(result.current.day).toBeNull();
  });

  it("delivers the active day once it is written to Firestore", async () => {
    const { result } = renderHook(() => useV3Day("child-1"));

    // Write through the real repository's write API.
    await createDay(testDb, activeDay);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.day?.id).toBe("day-1");
      expect(result.current.day?.wakeTime).toBe(7 * 60);
      expect(result.current.day?.status).toBe("active");
      expect(result.current.day?.suppressedRecurringIds).toEqual([]);
      expect(result.current.day?.suppressedDaycareDay).toBe(false);
    });
  });

  it("delivers null when no active day exists", async () => {
    const { result } = renderHook(() => useV3Day("child-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.day).toBeNull();
    });
  });
});
