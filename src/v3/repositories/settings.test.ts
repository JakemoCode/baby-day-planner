// @vitest-environment node
/**
 * V3 settings repository — Firestore single-doc get/save/watch.
 * Stored at /children/{childId}/settings/current; same path as V2 so
 * cutover is an import swap.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import { ALLOWED_USER, seedAllowedUser, startTestEnv } from "../../../tests/integration/firestore-test-utils";
import type { Settings } from "../schemas";
import { aSettings } from "../__tests__/factories";
import { getSettings, saveSettings, watchSettings } from "./settings";

// Test-specific overrides on top of the shared factory: child-1 id,
// named owners (Jake/Sam), and bottleChain.bottlesPerDay=5 to anchor
// the assertions below.
const settings = (overrides: Partial<Settings> = {}): Settings =>
  aSettings({
    childId: "child-1",
    bottleChain: { bottlesPerDay: 5, bufferAfterWakeMinutes: 10 },
    owners: {
      parent1: { displayName: "Jake", color: "#0af" },
      parent2: { displayName: "Sam", color: "#f0a" },
      other: [],
    },
    ...overrides,
  });

describe("v3 settings repository", () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => {
    env = await startTestEnv();
  });
  afterAll(async () => {
    env.cleanup();
  });
  beforeEach(async () => {
    await env.clearFirestore();
    await seedAllowedUser(env, ALLOWED_USER.uid, ["child-1"]);
  });

  function db(): Firestore {
    const ctx = env.authenticatedContext(ALLOWED_USER.uid, { email: ALLOWED_USER.email });
    return ctx.firestore() as unknown as Firestore;
  }

  it("returns null when no settings doc exists", async () => {
    expect(await getSettings(db(), "child-1")).toBeNull();
  });

  it("saves and reads back a full V3 Settings doc", async () => {
    const database = db();
    await saveSettings(database, "child-1", settings({}));
    const got = await getSettings(database, "child-1");
    expect(got?.defaultWakeTime).toBe(7 * 60);
    expect(got?.owners.parent1.displayName).toBe("Jake");
    expect(got?.bottleChain.bottlesPerDay).toBe(5);
  });

  it("watches settings and emits on change", async () => {
    const database = db();
    const seen: (Settings | null)[] = [];
    const unsub = watchSettings(database, "child-1", (s) => seen.push(s));
    await new Promise((r) => setTimeout(r, 100));
    await saveSettings(database, "child-1", settings({}));
    await new Promise((r) => setTimeout(r, 150));
    await saveSettings(database, "child-1", settings({ defaultWakeTime: 6 * 60 + 30 }));
    await new Promise((r) => setTimeout(r, 150));
    unsub();
    expect(seen[0]).toBeNull();
    expect(seen[seen.length - 1]?.defaultWakeTime).toBe(6 * 60 + 30);
  });
});
