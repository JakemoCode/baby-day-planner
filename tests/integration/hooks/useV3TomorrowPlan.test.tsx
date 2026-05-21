// @vitest-environment jsdom
/**
 * Integration test: useV3TomorrowPlan hook (§F12 PR 2)
 *
 * Subscribes to /children/{childId}/tomorrowPlans/{date}. Used by the
 * dashboard to surface `hasTomorrowPlan` to the dev StartDayButton.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import { ALLOWED_USER, seedAllowedUser, startTestEnv } from "../firestore-test-utils";
import { saveTomorrowPlan, confirmTomorrowPlan } from "../../../src/v3/repositories/tomorrowPlans";
import type { TomorrowPlan } from "../../../src/v3/schemas";
import { useV3TomorrowPlan } from "../../../src/v3/hooks/useV3TomorrowPlan";

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

const DATE = "2026-05-21";

const aPlan = (overrides: Partial<TomorrowPlan> = {}): TomorrowPlan => ({
  childId: "child-1",
  date: DATE,
  status: "draft",
  ownerOverrides: {},
  extras: [],
  ...overrides,
});

describe("useV3TomorrowPlan (emulator-backed)", () => {
  it("delivers null when no plan exists for the date", async () => {
    const { result } = renderHook(() => useV3TomorrowPlan("child-1", DATE));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.plan).toBeNull();
  });

  it("delivers the plan with status once it is saved", async () => {
    const { result } = renderHook(() => useV3TomorrowPlan("child-1", DATE));
    await saveTomorrowPlan(testDb, "child-1", aPlan({ status: "draft" }));

    await waitFor(() => {
      expect(result.current.plan?.status).toBe("draft");
    });
  });

  it("reflects status flips draft → confirmed via live subscription", async () => {
    await saveTomorrowPlan(testDb, "child-1", aPlan({ status: "draft" }));
    const { result } = renderHook(() => useV3TomorrowPlan("child-1", DATE));

    await waitFor(() => {
      expect(result.current.plan?.status).toBe("draft");
    });

    await confirmTomorrowPlan(testDb, "child-1", DATE, 19 * 60);

    await waitFor(() => {
      expect(result.current.plan?.status).toBe("confirmed");
      expect(result.current.plan?.confirmedAt).toBe(19 * 60);
    });
  });
});
