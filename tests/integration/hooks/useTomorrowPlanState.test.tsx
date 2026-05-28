// @vitest-environment jsdom
/**
 * Integration test: useTomorrowPlanState composed clear() seam (#12).
 *
 * The form buffer (useTomorrowPlanForm) is unit-tested in isolation,
 * but clear()'s correctness lives in the LIVE composition of delete +
 * blank + autosave-suppression against a real subscription — a unit
 * test can only simulate it. clear() must (a) delete the doc, (b) blank
 * the form, and (c) NOT let autosave resurrect the doc during the window
 * where the form is already blanked but the deleted-doc null snapshot
 * hasn't propagated yet (the `clearing` flag suppresses autosave across
 * that window). This exercises the real subscription + real form + real
 * repo writes against the emulator, including a wait past the autosave
 * debounce to prove no draft is rewritten.
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

// Keep every repo fn real except deleteTomorrowPlan, which stays real by
// default but can be made to reject once (to exercise clear()'s
// failed-delete path).
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

    // The seam under test: clear() deletes the doc and blanks the form.
    // reset() stays hydrated, so the stale (not-yet-null) snapshot can't
    // re-hydrate the deleted values and autosave can't resurrect them.
    await act(async () => {
      await result.current.clear();
    });

    // clear() awaits deleteTomorrowPlan, so the doc is already gone.
    expect(await loadTomorrowPlan(testDb, "child-1", DATE)).toBeNull();

    // UI state catches up once the subscription emits null.
    await waitFor(
      () => {
        expect(result.current.status).toBe("no-plan");
        expect(result.current.wakeTime).toBe(DEFAULT_WAKE);
        expect(result.current.ownerOverrides).toEqual({});
        expect(result.current.hasEdits).toBe(false);
      },
      { timeout: 2000 },
    );

    // Guard the residual window: wait past the autosave debounce (250ms)
    // and confirm no defaults `draft` was written back. Without the
    // `clearing` suppression, the blanked-form-but-stale-plan window
    // would resurrect the doc as a draft once the timer fired.
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

    // Force the delete to reject — clear() must restore the clearing flag
    // and re-throw, not leave autosave disabled.
    vi.mocked(deleteTomorrowPlan).mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      await expect(result.current.clear()).rejects.toThrow("offline");
    });

    // The doc still exists (delete failed). A subsequent edit must still
    // autosave — proving `clearing` was restored, not stuck true. If the
    // flag were stuck, autosaveInput would stay null and this never saves.
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
