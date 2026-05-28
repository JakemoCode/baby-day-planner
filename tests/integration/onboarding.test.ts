// @vitest-environment node
/**
 * Onboarding data-layer seam: the WRITE chain `WelcomePage.submit` performs, then
 * the READ chain `useChildResolution` uses (user→firstChildId→child). Real emulator,
 * real repos. Does NOT mount React — that layer is covered by component tests.
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

describe("onboarding seam (data layer)", () => {
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
    // Resolution must distinguish "no doc" from "empty childIds" — both route to welcome.
    await createUser(db(), { uid: ALLOWED_USER.uid, childIds: [], createdAt: 0 });
    const userDoc = await loadUser(db(), ALLOWED_USER.uid);
    expect(userDoc).not.toBeNull();
    expect(userDoc!.childIds).toEqual([]);
  });

  // Onboarding-batch race: the child snapshot listener can fire before the local
  // user doc reflects its new childIds, so canAccessChild's isLinkedToChild path
  // fails in that gap; isChildCreator (createdBy) keeps reads alive. Simulated here
  // by writing only the child doc and asserting the read still succeeds.
  it("creator-fallback: child readable without a user doc (onboarding race)", async () => {
    const conn = db();
    const newId = doc(collection(conn, CHILDREN)).id;
    await createChild(conn, {
      id: newId,
      displayName: "Aden",
      dateOfBirth: "2025-04-10",
      createdAt: 0,
      createdBy: ALLOWED_USER.uid,
    });

    const childDoc = await loadChild(conn, newId);
    expect(childDoc).not.toBeNull();
    expect(childDoc!.createdBy).toBe(ALLOWED_USER.uid);
  });
});
