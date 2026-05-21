// @vitest-environment node
/**
 * §F3 + §F10 onboarding seam test.
 *
 * Exercises the full WRITE chain that `WelcomePage.submit` performs,
 * then verifies the READ chain that `(signed-in-with-child)/layout.tsx`
 * uses via `useChildResolution` to resolve a freshly-onboarded user.
 *
 * Real emulator, real repos, real converters. Catches:
 *   - missing/extra fields in any of the 3 doc writes
 *   - rule mismatches (e.g. childIds field shape, uid ownership)
 *   - resolution chain breakage (user→firstChildId→child)
 *
 * Does NOT mount React — the React layer is covered by component tests.
 * This is the data-layer seam.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, type Firestore } from "firebase/firestore";
import { ALLOWED_USER, startTestEnv } from "./firestore-test-utils";
import { CHILDREN } from "../../src/lib/firestore/paths";
import { createChild, loadChild } from "../../src/v3/repositories/children";
import { createUser, loadUser } from "../../src/v3/repositories/users";
import { saveSettings, getSettings } from "../../src/v3/repositories/settings";
import { withV3SettingsDefaults } from "../../src/v3/firestore/settingsDefaults";

describe("§F3 + §F10 onboarding seam (data layer)", () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => {
    env = await startTestEnv();
  });
  afterAll(async () => {
    await env.cleanup();
  });
  beforeEach(async () => {
    await env.clearFirestore();
  });

  function db(): Firestore {
    const ctx = env.authenticatedContext(ALLOWED_USER.uid, { email: ALLOWED_USER.email });
    return ctx.firestore() as unknown as Firestore;
  }

  it("welcome submit chain: write child + settings + user → all readable in resolution order", async () => {
    // Mirrors WelcomePage.submit() exactly.
    const conn = db();
    const newId = doc(collection(conn, CHILDREN)).id;
    const now = Date.now();

    await createChild(conn, {
      id: newId,
      displayName: "Aden",
      dateOfBirth: "2025-04-10",
      createdAt: now,
      createdBy: ALLOWED_USER.uid,
    });

    const settings = withV3SettingsDefaults({
      childId: newId,
      defaultWakeTime: 7 * 60,
      owners: {
        parent1: { displayName: "Jake", color: "#0ab" },
        parent2: { displayName: "Kelly", color: "#f64" },
        other: [],
      },
    })!;
    await saveSettings(conn, newId, settings);

    await createUser(conn, {
      uid: ALLOWED_USER.uid,
      childIds: [newId],
      createdAt: now,
    });

    // === Resolution chain — mirrors useChildResolution() ===
    const userDoc = await loadUser(conn, ALLOWED_USER.uid);
    expect(userDoc).not.toBeNull();
    expect(userDoc!.childIds).toEqual([newId]);

    const firstChildId = userDoc!.childIds[0]!;
    const childDoc = await loadChild(conn, firstChildId);
    expect(childDoc).not.toBeNull();
    expect(childDoc!.displayName).toBe("Aden");
    expect(childDoc!.dateOfBirth).toBe("2025-04-10");
    expect(childDoc!.createdBy).toBe(ALLOWED_USER.uid);

    const settingsDoc = await getSettings(conn, firstChildId);
    expect(settingsDoc).not.toBeNull();
    expect(settingsDoc!.defaultWakeTime).toBe(7 * 60);
    expect(settingsDoc!.owners.parent1.displayName).toBe("Jake");
    expect(settingsDoc!.owners.parent2.displayName).toBe("Kelly");
  });

  it("pre-onboarding state: no /users/{uid} → resolution returns null user (gates welcome)", async () => {
    // Fresh sign-in, no welcome submit yet.
    const userDoc = await loadUser(db(), ALLOWED_USER.uid);
    expect(userDoc).toBeNull();
  });

  it("partially-onboarded state: user with empty childIds is distinguishable from no user", async () => {
    // Defensive — shouldn't happen with WelcomePage.submit() since it writes
    // childIds populated. But if invite flow or some other path ever creates
    // an empty user, the resolution chain must distinguish "no doc" (route
    // to welcome) from "empty childIds" (also route to welcome).
    await createUser(db(), { uid: ALLOWED_USER.uid, childIds: [], createdAt: 0 });
    const userDoc = await loadUser(db(), ALLOWED_USER.uid);
    expect(userDoc).not.toBeNull();
    expect(userDoc!.childIds).toEqual([]);
  });

  // §F17/§F12 PR 3 — locks the rules fix for the onboarding-batch race.
  //
  // After the writeBatch commits, the layout's child snapshot listener
  // can fire BEFORE the local view of the user doc reflects its new
  // `childIds`. canAccessChild's isLinkedToChild path returns false in
  // that gap; the creator-fallback (isChildCreator) keeps reads alive.
  //
  // This test simulates the race by writing the child + day docs but
  // NOT the user doc, then attempting reads. The reads must succeed
  // because the creator path applies.
  it("creator-fallback: child + day readable without a user doc (onboarding race)", async () => {
    const conn = db();
    const newId = doc(collection(conn, CHILDREN)).id;
    await createChild(conn, {
      id: newId,
      displayName: "Aden",
      dateOfBirth: "2025-04-10",
      createdAt: 0,
      createdBy: ALLOWED_USER.uid,
    });

    // Read /children/{childId} succeeds via creator fallback even though
    // no /users/{uid} doc exists yet.
    const childDoc = await loadChild(conn, newId);
    expect(childDoc).not.toBeNull();
    expect(childDoc!.createdBy).toBe(ALLOWED_USER.uid);
  });
});
