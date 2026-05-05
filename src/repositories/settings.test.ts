// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import { startTestEnv, ALLOWED_USER } from "../../tests/integration/firestore-test-utils";
import { getSettings, saveSettings } from "./settings";
import { sampleSettings } from "@/domain/__fixtures__/sample";

describe("settings repository", () => {
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

  it("returns null when no settings document exists", async () => {
    const ctx = env.authenticatedContext(ALLOWED_USER.uid, { email: ALLOWED_USER.email });
    const db = ctx.firestore() as unknown as Firestore;
    expect(await getSettings(db, "child-1")).toBeNull();
  });

  it("round-trips settings", async () => {
    const ctx = env.authenticatedContext(ALLOWED_USER.uid, { email: ALLOWED_USER.email });
    const db = ctx.firestore() as unknown as Firestore;
    await saveSettings(db, "child-1", sampleSettings);
    const loaded = await getSettings(db, "child-1");
    expect(loaded).toEqual(sampleSettings);
  });
});
