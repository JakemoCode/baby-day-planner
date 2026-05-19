// @vitest-environment node
/**
 * V3 Invite repository — Firestore CRUD against real emulator.
 * §F3 PR #2: co-parent invite flow.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import { ALLOWED_USER, startTestEnv } from "../../../tests/integration/firestore-test-utils";
import type { Invite } from "../schemas";
import { consumeInvite, createInvite, loadInvite } from "./invites";
import { createUser, loadUser } from "./users";
import { createChild } from "./children";

const ALLOWED_USER_2 = { uid: "kelly-uid", email: "kellyrbarber@gmail.com" };

const anInvite = (overrides: Partial<Invite> = {}): Invite => ({
  token: "tok-abc",
  childId: "child-xyz",
  createdBy: ALLOWED_USER.uid,
  createdAt: Date.now(),
  expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // +7 days from "now"
  ...overrides,
});

describe("v3 invites repository", () => {
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

  it("returns null when no invite exists for the token", async () => {
    const got = await loadInvite(dbAs(ALLOWED_USER), "missing-token");
    expect(got).toBeNull();
  });

  it("createInvite persists a doc that loadInvite round-trips", async () => {
    const invite = anInvite();
    await createInvite(dbAs(ALLOWED_USER), invite);
    const got = await loadInvite(dbAs(ALLOWED_USER), invite.token);
    expect(got).toEqual(invite);
  });

  describe("consumeInvite", () => {
    it("creates /users/{consumerUid} if missing and adds childId atomically", async () => {
      // Setup: creator (Jake) makes a child, then mints an invite.
      await createChild(dbAs(ALLOWED_USER), {
        id: "child-xyz",
        displayName: "Aden",
        dateOfBirth: "2025-04-10",
        createdAt: 0,
        createdBy: ALLOWED_USER.uid,
      });
      await createInvite(dbAs(ALLOWED_USER), anInvite());

      // Kelly (no /users doc yet) consumes.
      const result = await consumeInvite(dbAs(ALLOWED_USER_2), "tok-abc", ALLOWED_USER_2.uid);

      expect(result).toEqual({ childId: "child-xyz" });

      // Kelly's user doc now exists with the childId.
      const kellyUser = await loadUser(dbAs(ALLOWED_USER_2), ALLOWED_USER_2.uid);
      expect(kellyUser).not.toBeNull();
      expect(kellyUser!.childIds).toEqual(["child-xyz"]);

      // Invite is marked consumed.
      const consumed = await loadInvite(dbAs(ALLOWED_USER), "tok-abc");
      expect(consumed!.consumedBy).toBe(ALLOWED_USER_2.uid);
      expect(typeof consumed!.consumedAt).toBe("number");
    });

    it("appends to existing /users/{consumerUid}.childIds without overwriting", async () => {
      await createInvite(dbAs(ALLOWED_USER), anInvite());
      // Kelly already has a previous child.
      await createUser(dbAs(ALLOWED_USER_2), {
        uid: ALLOWED_USER_2.uid,
        childIds: ["older-child"],
        createdAt: 0,
      });

      await consumeInvite(dbAs(ALLOWED_USER_2), "tok-abc", ALLOWED_USER_2.uid);

      const kellyUser = await loadUser(dbAs(ALLOWED_USER_2), ALLOWED_USER_2.uid);
      expect(kellyUser!.childIds).toEqual(["older-child", "child-xyz"]);
    });

    it("throws when invite is already consumed", async () => {
      await createInvite(
        dbAs(ALLOWED_USER),
        anInvite({ consumedBy: "someone-else", consumedAt: 1 }),
      );
      await expect(
        consumeInvite(dbAs(ALLOWED_USER_2), "tok-abc", ALLOWED_USER_2.uid),
      ).rejects.toThrow(/already consumed/i);
    });

    it("throws when invite has expired", async () => {
      await createInvite(
        dbAs(ALLOWED_USER),
        anInvite({ expiresAt: Date.now() - 1000 }), // expired 1s ago
      );
      await expect(
        consumeInvite(dbAs(ALLOWED_USER_2), "tok-abc", ALLOWED_USER_2.uid),
      ).rejects.toThrow(/expired/i);
    });

    it("throws when invite is missing", async () => {
      await expect(
        consumeInvite(dbAs(ALLOWED_USER_2), "no-such-token", ALLOWED_USER_2.uid),
      ).rejects.toThrow(/not found/i);
    });

    it("throws when the creator tries to consume their own invite", async () => {
      await createInvite(dbAs(ALLOWED_USER), anInvite());
      await expect(consumeInvite(dbAs(ALLOWED_USER), "tok-abc", ALLOWED_USER.uid)).rejects.toThrow(
        /own invite/i,
      );
    });
  });
});
