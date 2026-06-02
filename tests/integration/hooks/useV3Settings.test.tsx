// @vitest-environment jsdom
/**
 * Seam test: real Firestore emulator → real settings repo → useV3Settings →
 * withV3SettingsDefaults. settingsDefaults.test.ts covers the defaulter in
 * isolation; this proves the hook→repo→defaulter wiring with real data.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import { ALLOWED_USER, seedAllowedUser, startTestEnv } from "../firestore-test-utils";
import { saveSettings } from "../../../src/v3/repositories/settings";
import type { Settings } from "../../../src/v3/schemas";
import { useV3Settings } from "../../../src/v3/hooks/useV3Settings";

let testDb: Firestore;

// Point the Firebase singleton at the emulator db. Getter defers resolution to
// call time so beforeAll can populate `testDb` before the hoisted mock is read.
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

/** Minimal doc that omits bottleChain/owners/daycare so the defaulter must fill them. */
const minimalSettings = {
  childId: "child-1",
  defaultWakeTime: 7 * 60,
} as unknown as Settings;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useV3Settings (emulator-backed)", () => {
  it("starts in a loading state before any Firestore data arrives", () => {
    const { result } = renderHook(() => useV3Settings("child-1"));
    expect(result.current.loading).toBe(true);
    expect(result.current.settings).toBeNull();
  });

  it("delivers null when no settings doc exists", async () => {
    const { result } = renderHook(() => useV3Settings("child-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.settings).toBeNull();
    });
  });

  it("delivers settings with withV3SettingsDefaults applied after a write", async () => {
    const { result } = renderHook(() => useV3Settings("child-1"));

    // Write a partial doc through the real repository.
    await saveSettings(testDb, "child-1", minimalSettings);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.settings).not.toBeNull();

      // Explicitly-written field is preserved.
      expect(result.current.settings?.defaultWakeTime).toBe(7 * 60);

      // Defaulter fills bottleChain through the real wiring — the seam under test.
      expect(result.current.settings?.bottleChain).toEqual({
        bufferAfterWakeMinutes: 10,
      });

      // owners color is slot-keyed now, so only displayName is asserted.
      expect(result.current.settings?.owners.parent1).toMatchObject({
        displayName: expect.any(String),
      });
      expect(result.current.settings?.owners.other).toEqual([]);
    });
  });

  it("delivers updated settings when the doc changes in Firestore", async () => {
    const { result } = renderHook(() => useV3Settings("child-1"));

    await saveSettings(testDb, "child-1", minimalSettings);

    await waitFor(() => {
      expect(result.current.settings?.defaultWakeTime).toBe(7 * 60);
    });

    // Update the doc — hook should reflect the new value.
    await saveSettings(testDb, "child-1", {
      ...minimalSettings,
      defaultWakeTime: 6 * 60 + 30,
    } as unknown as Settings);

    await waitFor(() => {
      expect(result.current.settings?.defaultWakeTime).toBe(6 * 60 + 30);
    });
  });
});
