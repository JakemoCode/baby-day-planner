// @vitest-environment jsdom
/**
 * Integration test: useV3Settings hook
 *
 * Exercises the seam: real Firestore emulator → real settings repository →
 * useV3Settings hook → withV3SettingsDefaults. Previously mocked with
 * vi.mock("../repositories/settings") which left the wiring silently
 * untested — the defaulter passed its own unit tests but the hook→repo→
 * defaulter chain was never exercised with real Firestore data.
 *
 * settingsDefaults.test.ts covers withV3SettingsDefaults in isolation.
 * This test's job is the SEAM: real Firestore → real repo → real hook →
 * defaulted shape.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import { ALLOWED_USER, seedAllowedUser, startTestEnv } from "../firestore-test-utils";
import { saveSettings } from "../../../src/v3/repositories/settings";
import type { Settings } from "../../../src/v3/schemas";
import { useV3Settings } from "../../../src/v3/hooks/useV3Settings";

// ---------------------------------------------------------------------------
// Emulator db — populated in beforeAll, read by the module mock below.
// ---------------------------------------------------------------------------

let testDb: Firestore;

// Replace the production Firebase singleton with the emulator-backed db.
// vi.mock is hoisted above all imports by Vitest's transform, so the factory
// runs before the hook module resolves. The getter pattern defers value
// resolution to call time so `testDb` is populated by beforeAll before any
// test invokes the hook.
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
// Helpers
// ---------------------------------------------------------------------------

/** Minimal settings doc — only the fields a first-time user might have set.
 * Deliberately omits bottleChain, owners, daycare etc. to verify the
 * defaulter fills them in through the real wiring. */
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

      // Defaulter fills in bottleChain — the key seam this test covers.
      // settingsDefaults.test.ts validates the defaulter in isolation;
      // this test proves the hook → repo → defaulter wiring is real.
      expect(result.current.settings?.bottleChain).toEqual({
        bottlesPerDay: 5,
        bufferAfterWakeMinutes: 10,
      });

      // Defaulter fills in the owners config with the expected shape.
      expect(result.current.settings?.owners.parent1).toMatchObject({
        displayName: expect.any(String),
        color: expect.any(String),
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
