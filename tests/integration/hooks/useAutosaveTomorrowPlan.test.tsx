// @vitest-environment jsdom
/**
 * Integration test: useAutosaveTomorrowPlan (§F12 PR 3)
 *
 * Drives the autosave seam: when /tomorrow form state changes, after
 * a debounce delay a TomorrowPlan with status="draft" appears in
 * Firestore. Subsequent edits update the same doc (one per date).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import { ALLOWED_USER, seedAllowedUser, startTestEnv } from "../firestore-test-utils";
import {
  confirmTomorrowPlan,
  loadTomorrowPlan,
  saveTomorrowPlan,
} from "../../../src/v3/repositories/tomorrowPlans";
import { useAutosaveTomorrowPlan } from "../../../src/v3/hooks/useAutosaveTomorrowPlan";

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

describe("useAutosaveTomorrowPlan (emulator-backed)", () => {
  // Slice A
  it("persists a draft TomorrowPlan when input becomes non-null", async () => {
    type Input = Parameters<typeof useAutosaveTomorrowPlan>[2];
    const { rerender } = renderHook(
      ({ input }: { input: Input }) =>
        useAutosaveTomorrowPlan("child-1", DATE, input, { debounceMs: 50 }),
      { initialProps: { input: null as Input } },
    );

    // Initially no input → no write
    let plan = await loadTomorrowPlan(testDb, "child-1", DATE);
    expect(plan).toBeNull();

    // Form picks up a wakeTime
    rerender({
      input: {
        wakeTime: 7 * 60 + 30,
        ownerOverrides: {},
        extras: [],
      },
    });

    await waitFor(
      async () => {
        const got = await loadTomorrowPlan(testDb, "child-1", DATE);
        expect(got).not.toBeNull();
      },
      { timeout: 1500 },
    );

    plan = await loadTomorrowPlan(testDb, "child-1", DATE);
    expect(plan?.status).toBe("draft");
    expect(plan?.wakeTime).toBe(7 * 60 + 30);
    expect(plan?.ownerOverrides).toEqual({});
    expect(plan?.extras).toEqual([]);
  });

  // Slice B
  it("edit to a confirmed plan reverts status to draft + clears confirmedAt", async () => {
    // Seed: existing confirmed plan in Firestore
    await saveTomorrowPlan(testDb, "child-1", {
      childId: "child-1",
      date: DATE,
      status: "draft",
      wakeTime: 7 * 60,
      ownerOverrides: {},
      extras: [],
    });
    await confirmTomorrowPlan(testDb, "child-1", DATE, 19 * 60);
    const seeded = await loadTomorrowPlan(testDb, "child-1", DATE);
    expect(seeded?.status).toBe("confirmed");
    expect(seeded?.confirmedAt).toBe(19 * 60);

    type Input = Parameters<typeof useAutosaveTomorrowPlan>[2];
    renderHook(() =>
      useAutosaveTomorrowPlan(
        "child-1",
        DATE,
        {
          wakeTime: 8 * 60, // edited from 7:00 → 8:00
          ownerOverrides: {},
          extras: [],
        } satisfies NonNullable<Input>,
        { debounceMs: 50 },
      ),
    );

    await waitFor(
      async () => {
        const got = await loadTomorrowPlan(testDb, "child-1", DATE);
        expect(got?.status).toBe("draft");
        expect(got?.wakeTime).toBe(8 * 60);
        expect(got?.confirmedAt).toBeUndefined();
      },
      { timeout: 1500 },
    );
  });
});
