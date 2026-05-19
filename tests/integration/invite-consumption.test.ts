// @vitest-environment node
/**
 * §F3 PR #2 invite consumption end-to-end seam test.
 *
 * Specifically validates the *rule-tightening* gate: a second allowlisted
 * user cannot read another user's child UNTIL they've consumed an invite.
 * Without the PR #2 rule tightening, an allowlisted email was the sole
 * gate — anyone in the allowlist could read any /children/{id}. This test
 * makes that contract explicit and would fail loudly if the rule ever
 * regressed.
 *
 * The data-layer correctness of consumeInvite itself is covered by
 * src/v3/repositories/invites.test.ts. This adds the cross-user rule
 * dimension.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, type Firestore } from "firebase/firestore";
import { ALLOWED_USER, seedAllowedUser, startTestEnv } from "./firestore-test-utils";
import { INVITES } from "../../src/lib/firestore/paths";
import { createChild, loadChild } from "../../src/v3/repositories/children";
import { createInvite, consumeInvite } from "../../src/v3/repositories/invites";
import { loadUser } from "../../src/v3/repositories/users";

const KELLY = { uid: "kelly-uid", email: "kellyrbarber@gmail.com" };

describe("§F3 PR #2 — invite consumption end-to-end", () => {
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

  function dbAs(user: { uid: string; email: string }): Firestore {
    const ctx = env.authenticatedContext(user.uid, { email: user.email });
    return ctx.firestore() as unknown as Firestore;
  }

  it("Kelly cannot read Jake's child before invite consumption, can after", async () => {
    // Jake's setup: he has user doc + child.
    await seedAllowedUser(env, ALLOWED_USER.uid, ["jakes-child"]);
    await createChild(dbAs(ALLOWED_USER), {
      id: "jakes-child",
      displayName: "Aden",
      dateOfBirth: "2025-04-10",
      createdAt: 0,
      createdBy: ALLOWED_USER.uid,
    });

    // === Before consumption: Kelly is allowlisted but lacks the user→child mapping. ===
    // She has no /users/kelly doc, so the get() in canAccessChild rule is
    // a missing-doc reference; expect permission-denied (throw).
    await expect(loadChild(dbAs(KELLY), "jakes-child")).rejects.toThrow();

    // === Jake mints invite, Kelly consumes. ===
    const conn = dbAs(ALLOWED_USER);
    const tokenId = doc(collection(conn, INVITES)).id;
    const now = Date.now();
    await createInvite(conn, {
      token: tokenId,
      childId: "jakes-child",
      createdBy: ALLOWED_USER.uid,
      createdAt: now,
      expiresAt: now + 60_000,
    });

    const result = await consumeInvite(dbAs(KELLY), tokenId, KELLY.uid);
    expect(result.childId).toBe("jakes-child");

    // === After consumption: Kelly's user doc has the childId; rule passes. ===
    const kellyChild = await loadChild(dbAs(KELLY), "jakes-child");
    expect(kellyChild?.displayName).toBe("Aden");

    // Jake can still read it too — the rule check is per-user, not exclusive.
    const jakeChild = await loadChild(dbAs(ALLOWED_USER), "jakes-child");
    expect(jakeChild?.displayName).toBe("Aden");
  });

  it("Kelly cannot read an unrelated child she wasn't invited to", async () => {
    // Jake has two children but only invites Kelly to one.
    await seedAllowedUser(env, ALLOWED_USER.uid, ["shared-child", "private-child"]);
    await createChild(dbAs(ALLOWED_USER), {
      id: "shared-child",
      displayName: "Aden",
      dateOfBirth: "2025-04-10",
      createdAt: 0,
      createdBy: ALLOWED_USER.uid,
    });
    await createChild(dbAs(ALLOWED_USER), {
      id: "private-child",
      displayName: "Bea",
      dateOfBirth: "2024-06-01",
      createdAt: 0,
      createdBy: ALLOWED_USER.uid,
    });

    const conn = dbAs(ALLOWED_USER);
    const tokenId = doc(collection(conn, INVITES)).id;
    const now = Date.now();
    await createInvite(conn, {
      token: tokenId,
      childId: "shared-child",
      createdBy: ALLOWED_USER.uid,
      createdAt: now,
      expiresAt: now + 60_000,
    });
    await consumeInvite(dbAs(KELLY), tokenId, KELLY.uid);

    // Kelly sees the shared one...
    const shared = await loadChild(dbAs(KELLY), "shared-child");
    expect(shared?.displayName).toBe("Aden");

    // ...but cannot read the private one.
    await expect(loadChild(dbAs(KELLY), "private-child")).rejects.toThrow();

    // Kelly's user doc reflects exactly the one child.
    const kellyUser = await loadUser(dbAs(KELLY), KELLY.uid);
    expect(kellyUser?.childIds).toEqual(["shared-child"]);
  });
});
