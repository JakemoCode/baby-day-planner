// @vitest-environment jsdom
/**
 * Integration test: useV3TomorrowDraftCount (§F12 PR 3).
 *
 * Real Firestore emulator → real subscription. Verifies that draft
 * plans are counted and confirmed plans are not.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import { ALLOWED_USER, seedAllowedUser, startTestEnv } from "../firestore-test-utils";
import { confirmTomorrowPlan, saveTomorrowPlan } from "../../../src/v3/repositories/tomorrowPlans";
import { useV3TomorrowDraftCount } from "../../../src/v3/hooks/useV3TomorrowDraftCount";

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

describe("useV3TomorrowDraftCount (emulator-backed)", () => {
  it("starts at 0 with no plans", async () => {
    const { result } = renderHook(() => useV3TomorrowDraftCount("child-1"));
    await waitFor(() => {
      expect(result.current).toBe(0);
    });
  });

  it("reports 1 when a single draft plan exists", async () => {
    await saveTomorrowPlan(testDb, "child-1", {
      childId: "child-1",
      date: "2026-05-22",
      status: "draft",
      wakeTime: 7 * 60,
      ownerOverrides: {},
      extras: [],
    });
    const { result } = renderHook(() => useV3TomorrowDraftCount("child-1"));
    await waitFor(() => {
      expect(result.current).toBe(1);
    });
  });

  it("does NOT count confirmed plans", async () => {
    await saveTomorrowPlan(testDb, "child-1", {
      childId: "child-1",
      date: "2026-05-22",
      status: "draft",
      wakeTime: 7 * 60,
      ownerOverrides: {},
      extras: [],
    });
    await confirmTomorrowPlan(testDb, "child-1", "2026-05-22", 19 * 60);

    const { result } = renderHook(() => useV3TomorrowDraftCount("child-1"));
    await waitFor(() => {
      expect(result.current).toBe(0);
    });
  });

  it("drops back to 0 when the only draft is confirmed live", async () => {
    await saveTomorrowPlan(testDb, "child-1", {
      childId: "child-1",
      date: "2026-05-22",
      status: "draft",
      wakeTime: 7 * 60,
      ownerOverrides: {},
      extras: [],
    });
    const { result } = renderHook(() => useV3TomorrowDraftCount("child-1"));
    await waitFor(() => expect(result.current).toBe(1));

    await confirmTomorrowPlan(testDb, "child-1", "2026-05-22", 19 * 60);

    await waitFor(() => expect(result.current).toBe(0));
  });
});
