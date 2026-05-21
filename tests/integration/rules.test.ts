// @vitest-environment node
import { describe, it, beforeAll, beforeEach, afterAll } from "vitest";
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  startTestEnv,
  seedAllowedUser,
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
    // §F17 PR 3 (2026-05-21): allowlist removed. Per-user data
    // isolation now relies entirely on canAccessChild (user→child
    // mapping + createdBy fallback). Seed jake → ["c1"] so the
    // link-based read tests pass; the "denies a stranger" test is
    // independent (they have neither the link nor the creator path).
    await seedAllowedUser(env, ALLOWED_USER.uid, ["c1"]);
  });

  it("denies reads to unauthenticated users", async () => {
    const ctx = env.unauthenticatedContext();
    await assertFails(getDoc(doc(ctx.firestore(), "children/c1/settings/current")));
  });

  it("denies reads to authenticated users without canAccessChild access", async () => {
    // Strangers ARE signed in (allowlist removed) but lack both
    // paths: their user doc doesn't list c1, and they didn't create c1.
    const ctx = env.authenticatedContext(FORBIDDEN_USER.uid, { email: FORBIDDEN_USER.email });
    await assertFails(getDoc(doc(ctx.firestore(), "children/c1/settings/current")));
  });

  it("permits reads to users linked via canAccessChild", async () => {
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
