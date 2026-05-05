// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  startTestEnv,
  ALLOWED_USER,
  FORBIDDEN_USER,
} from "./firestore-test-utils";

describe("Firestore security rules", () => {
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

  it("denies reads to unauthenticated users", async () => {
    const ctx = env.unauthenticatedContext();
    await assertFails(getDoc(doc(ctx.firestore(), "children/c1/settings/current")));
  });

  it("denies reads to non-allowlisted users", async () => {
    const ctx = env.authenticatedContext(FORBIDDEN_USER.uid, { email: FORBIDDEN_USER.email });
    await assertFails(getDoc(doc(ctx.firestore(), "children/c1/settings/current")));
  });

  it("permits reads to allowlisted users", async () => {
    const ctx = env.authenticatedContext(ALLOWED_USER.uid, { email: ALLOWED_USER.email });
    await assertSucceeds(getDoc(doc(ctx.firestore(), "children/c1/settings/current")));
  });

  it("denies day create with mismatched childId", async () => {
    const ctx = env.authenticatedContext(ALLOWED_USER.uid, { email: ALLOWED_USER.email });
    await assertFails(
      setDoc(doc(ctx.firestore(), "children/c1/days/d1"), {
        id: "d1",
        childId: "OTHER",
        date: "2026-05-05",
        status: "active",
        createdAt: "2026-05-05T07:00:00Z",
      }),
    );
  });

  it("permits day create with correct shape", async () => {
    const ctx = env.authenticatedContext(ALLOWED_USER.uid, { email: ALLOWED_USER.email });
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), "children/c1/days/d1"), {
        id: "d1",
        childId: "c1",
        date: "2026-05-05",
        status: "active",
        createdAt: "2026-05-05T07:00:00Z",
      }),
    );
  });
});
