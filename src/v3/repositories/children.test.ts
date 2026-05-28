// @vitest-environment node
/**
 * V3 Child repository — Firestore CRUD against real emulator.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import {
  ALLOWED_USER,
  seedAllowedUser,
  startTestEnv,
} from "../../../tests/integration/firestore-test-utils";
import type { Child } from "../schemas";
import { createChild, loadChild } from "./children";

const aChild = (overrides: Partial<Child> = {}): Child => ({
  id: "child-abc",
  displayName: "Aden",
  dateOfBirth: "2025-04-10",
  createdAt: 1_700_000_000_000,
  createdBy: ALLOWED_USER.uid,
  ...overrides,
});

describe("v3 children repository", () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => {
    env = await startTestEnv();
  });
  afterAll(async () => {
    await env.cleanup();
  });
  beforeEach(async () => {
    await env.clearFirestore();
    await seedAllowedUser(env, ALLOWED_USER.uid, ["child-abc", "kid-1", "kid-2", "missing-id"]);
  });

  function db(): Firestore {
    const ctx = env.authenticatedContext(ALLOWED_USER.uid, { email: ALLOWED_USER.email });
    return ctx.firestore() as unknown as Firestore;
  }

  it("returns null when no child doc exists for the id", async () => {
    const got = await loadChild(db(), "missing-id");
    expect(got).toBeNull();
  });

  it("createChild persists a doc that loadChild round-trips", async () => {
    const child = aChild();
    await createChild(db(), child);
    const got = await loadChild(db(), child.id);
    expect(got).toEqual(child);
  });

  it("two children with different ids are independent", async () => {
    await createChild(db(), aChild({ id: "kid-1", displayName: "Aden" }));
    await createChild(db(), aChild({ id: "kid-2", displayName: "Bea" }));
    const a = await loadChild(db(), "kid-1");
    const b = await loadChild(db(), "kid-2");
    expect(a?.displayName).toBe("Aden");
    expect(b?.displayName).toBe("Bea");
  });
});
