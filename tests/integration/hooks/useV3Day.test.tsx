// @vitest-environment jsdom
/**
 * Integration test: useV3Day hook
 *
 * Exercises the seam: real Firestore emulator → real days repository →
 * useV3Day hook subscription. Previously mocked with
 * vi.mock("../repositories/days") which left the wiring silently untested.
 *
 * The hook imports `db` from "@/lib/firebase/client". We replace that
 * singleton with the emulator-backed db from startTestEnv() — this is a
 * legitimate infrastructure-boundary mock (analogous to mocking the network
 * transport), not a business-logic mock. The real repository and real
 * Firestore subscription run end-to-end.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import { ALLOWED_USER, seedAllowedUser, startTestEnv } from "../firestore-test-utils";
import { createDay } from "../../../src/v3/repositories/days";
import type { Day } from "../../../src/v3/schemas";
import { useV3Day } from "../../../src/v3/hooks/useV3Day";

// ---------------------------------------------------------------------------
// Emulator db — populated in beforeAll, read by the module mock below.
// ---------------------------------------------------------------------------

let testDb: Firestore;

// Replace the production Firebase singleton with the emulator-backed db.
// vi.mock is hoisted above all imports by Vitest's transform, so the factory
// runs before the hook module resolves. The getter pattern (get db()) defers
// the actual value to call time, ensuring `testDb` is populated by beforeAll
// before any test invokes the hook.
vi.mock("@/lib/firebase/client", () => ({
  get db() {
    return testDb;
  },
}));

// ---------------------------------------------------------------------------
// Emulator lifecycle
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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
      // After the initial snapshot resolves with an empty result, loading
      // transitions to false and day stays null.
      expect(result.current.loading).toBe(false);
      expect(result.current.day).toBeNull();
    });
  });
});
