// @vitest-environment jsdom
/**
 * Integration test: useTomorrowPlanState composed clear() seam (#12).
 *
 * The form buffer (useTomorrowPlanForm) is unit-tested in isolation,
 * but clear()'s correctness depends on a LIVE ordering that a unit test
 * can only simulate: deleteTomorrowPlan must push `plan = null` through
 * the real useV3TomorrowPlan subscription BEFORE reset()'s re-armed
 * hydration runs — otherwise the re-arm would re-hydrate from the stale
 * plan and the form wouldn't blank. This exercises the real
 * subscription + real form + real repo writes against the emulator to
 * pin that ordering.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import { ALLOWED_USER, seedAllowedUser, startTestEnv } from "../firestore-test-utils";
import { loadTomorrowPlan, saveTomorrowPlan } from "../../../src/v3/repositories/tomorrowPlans";
import { useTomorrowPlanState } from "../../../src/v3/hooks/useTomorrowPlanState";
import { makeDefaultSettings } from "../../../src/v3/firestore/settingsDefaults";

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

const DATE = "2026-05-22";
const settings = makeDefaultSettings("child-1");
const DEFAULT_WAKE = settings.defaultWakeTime;

describe("useTomorrowPlanState — clear() seam (emulator-backed)", () => {
  it("clear() deletes the doc and the live subscription blanks the form to defaults", async () => {
    // Seed a confirmed plan that differs from defaults so we can see the
    // form both hydrate to it and then blank back.
    await saveTomorrowPlan(testDb, "child-1", {
      childId: "child-1",
      date: DATE,
      status: "confirmed",
      confirmedAt: 19 * 60,
      wakeTime: DEFAULT_WAKE + 90, // clearly non-default
      ownerOverrides: { nap_1: { slot: "parent1" } },
      extras: [],
    });

    const { result } = renderHook(() => useTomorrowPlanState("child-1", DATE, settings));

    // Form hydrates from the seeded plan via the real subscription.
    await waitFor(
      () => {
        expect(result.current.loading).toBe(false);
        expect(result.current.status).toBe("confirmed");
        expect(result.current.wakeTime).toBe(DEFAULT_WAKE + 90);
      },
      { timeout: 2000 },
    );
    expect(result.current.ownerOverrides).toEqual({ nap_1: { slot: "parent1" } });
    expect(result.current.hasEdits).toBe(true);

    // The seam under test: clear() deletes the doc; the subscription
    // emits null, and reset()'s re-arm folds that null in → defaults.
    await act(async () => {
      await result.current.clear();
    });

    await waitFor(
      async () => {
        expect(await loadTomorrowPlan(testDb, "child-1", DATE)).toBeNull();
        expect(result.current.status).toBe("no-plan");
        expect(result.current.wakeTime).toBe(DEFAULT_WAKE);
        expect(result.current.ownerOverrides).toEqual({});
        expect(result.current.hasEdits).toBe(false);
      },
      { timeout: 2000 },
    );
  });
});
