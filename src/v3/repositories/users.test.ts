// @vitest-environment node
/**
 * V3 User repository — Firestore CRUD against real emulator.
 * §F3 PR #1: schema + repo, no UI/auth wiring yet.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import { ALLOWED_USER, startTestEnv } from "../../../tests/integration/firestore-test-utils";
import type { User } from "../schemas";
import { addChildToUser, createUser, loadUser } from "./users";

const aUser = (overrides: Partial<User> = {}): User => ({
  uid: ALLOWED_USER.uid,
  childIds: [],
  createdAt: 1_700_000_000_000,
  ...overrides,
});

describe("v3 users repository", () => {
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

  it("returns null when no user doc exists yet for the current uid", async () => {
    const got = await loadUser(db(), ALLOWED_USER.uid);
    expect(got).toBeNull();
  });

  it("createUser persists a doc that loadUser round-trips", async () => {
    const user = aUser();
    await createUser(db(), user);
    const got = await loadUser(db(), user.uid);
    expect(got).toEqual(user);
  });

  it("addChildToUser appends a childId", async () => {
    await createUser(db(), aUser());
    await addChildToUser(db(), ALLOWED_USER.uid, "kid-1");
    const got = await loadUser(db(), ALLOWED_USER.uid);
    expect(got?.childIds).toEqual(["kid-1"]);
  });

  it("addChildToUser is idempotent — adding same id twice yields one entry", async () => {
    await createUser(db(), aUser({ childIds: ["kid-1"] }));
    await addChildToUser(db(), ALLOWED_USER.uid, "kid-1");
    const got = await loadUser(db(), ALLOWED_USER.uid);
    expect(got?.childIds).toEqual(["kid-1"]);
  });

  it("addChildToUser preserves existing childIds when adding a new one", async () => {
    await createUser(db(), aUser({ childIds: ["kid-1"] }));
    await addChildToUser(db(), ALLOWED_USER.uid, "kid-2");
    const got = await loadUser(db(), ALLOWED_USER.uid);
    expect(got?.childIds).toEqual(["kid-1", "kid-2"]);
  });
});
