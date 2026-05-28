// @vitest-environment jsdom
/**
 * Integration test: useTomorrowPlanState — clear() seam (real subscription + real repo).
 * Verifies: delete doc, blank form, and autosave suppression across the clearing window.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import { ALLOWED_USER, seedAllowedUser, startTestEnv } from "../firestore-test-utils";
import {
  deleteTomorrowPlan,
  loadTomorrowPlan,
  saveTomorrowPlan,
} from "../../../src/v3/repositories/tomorrowPlans";
import type * as TomorrowPlansRepo from "../../../src/v3/repositories/tomorrowPlans";
import { useTomorrowPlanState } from "../../../src/v3/hooks/useTomorrowPlanState";
import { makeDefaultSettings } from "../../../src/v3/firestore/settingsDefaults";

let testDb: Firestore;

vi.mock("@/lib/firebase/client", () => ({
  get db() {
    return testDb;
  },
}));

// Real repo except deleteTomorrowPlan, which can be made to reject (failed-delete path).
vi.mock("../../../src/v3/repositories/tomorrowPlans", async (importOriginal) => {
  const actual = await importOriginal<typeof TomorrowPlansRepo>();
  return {
    ...actual,
    deleteTomorrowPlan: vi.fn((...args: Parameters<typeof actual.deleteTomorrowPlan>) =>
      actual.deleteTomorrowPlan(...args),
    ),
  };
});

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

    // clear() deletes + blanks; reset() stays hydrated so stale snapshot can't re-hydrate.
    await act(async () => {
      await result.current.clear();
    });

    expect(await loadTomorrowPlan(testDb, "child-1", DATE)).toBeNull();

    await waitFor(
      () => {
        expect(result.current.status).toBe("no-plan");
        expect(result.current.wakeTime).toBe(DEFAULT_WAKE);
        expect(result.current.ownerOverrides).toEqual({});
        expect(result.current.hasEdits).toBe(false);
      },
      { timeout: 2000 },
    );

    // Wait past autosave debounce; without the clearing flag, blanked form would resurrect the doc.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(await loadTomorrowPlan(testDb, "child-1", DATE)).toBeNull();
  });

  it("restores autosave when the delete fails (clearing flag not stuck)", async () => {
    await saveTomorrowPlan(testDb, "child-1", {
      childId: "child-1",
      date: DATE,
      status: "confirmed",
      confirmedAt: 19 * 60,
      wakeTime: DEFAULT_WAKE + 90,
      ownerOverrides: {},
      extras: [],
    });

    const { result } = renderHook(() => useTomorrowPlanState("child-1", DATE, settings));
    await waitFor(
      () => {
        expect(result.current.loading).toBe(false);
        expect(result.current.wakeTime).toBe(DEFAULT_WAKE + 90);
      },
      { timeout: 2000 },
    );

    // Force delete to reject — clearing flag must be restored so autosave isn't permanently disabled.
    vi.mocked(deleteTomorrowPlan).mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      await expect(result.current.clear()).rejects.toThrow("offline");
    });

    // Doc still exists; subsequent edit must autosave to prove clearing flag was restored.
    act(() => result.current.setWakeTime(DEFAULT_WAKE + 5));
    await waitFor(
      async () => {
        const got = await loadTomorrowPlan(testDb, "child-1", DATE);
        expect(got?.status).toBe("draft");
        expect(got?.wakeTime).toBe(DEFAULT_WAKE + 5);
      },
      { timeout: 2000 },
    );
  });
});
