// @vitest-environment node
/**
 * V3 templates repository — Firestore CRUD against real emulator.
 * Mirrors V2's surface so cutover at consumer sites is an import swap.
 * Wire shape: V3 OwnershipTemplate uses slot-based OwnerRefs.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import {
  ALLOWED_USER,
  seedAllowedUser,
  startTestEnv,
} from "../../../tests/integration/firestore-test-utils";
import type { OwnershipTemplate } from "../schemas";
import { deleteTemplate, listTemplates, saveTemplate } from "./templates";

const tpl = (overrides: Partial<OwnershipTemplate>): OwnershipTemplate => ({
  id: "tpl-saturday",
  displayName: "Saturday",
  napOwners: [{ slot: "parent1" }, { slot: "parent2" }],
  wakeWindowOwners: [{ slot: "parent1" }],
  bottleOwners: [{ slot: "parent2" }],
  bedtimeOwner: { slot: "parent1" },
  ...overrides,
});

describe("v3 templates repository", () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => {
    env = await startTestEnv();
  });
  afterAll(async () => {
    await env.cleanup();
  });
  beforeEach(async () => {
    await env.clearFirestore();
    await seedAllowedUser(env, ALLOWED_USER.uid, ["child-1"]);
  });

  function db(): Firestore {
    const ctx = env.authenticatedContext(ALLOWED_USER.uid, { email: ALLOWED_USER.email });
    return ctx.firestore() as unknown as Firestore;
  }

  it("saves and lists templates with slot-based OwnerRefs intact", async () => {
    const database = db();
    await saveTemplate(database, "child-1", tpl({}));
    await saveTemplate(database, "child-1", tpl({ id: "tpl-weekday", displayName: "Weekday" }));
    const list = await listTemplates(database, "child-1");
    expect(list.map((t) => t.id).sort()).toEqual(["tpl-saturday", "tpl-weekday"]);
    const sat = list.find((t) => t.id === "tpl-saturday");
    expect(sat?.napOwners).toEqual([{ slot: "parent1" }, { slot: "parent2" }]);
  });

  it("round-trips an other-slot OwnerRef without flattening", async () => {
    const database = db();
    await saveTemplate(
      database,
      "child-1",
      tpl({ napOwners: [{ slot: "other", otherId: "grandma" }] }),
    );
    const list = await listTemplates(database, "child-1");
    expect(list[0]?.napOwners[0]).toEqual({ slot: "other", otherId: "grandma" });
  });

  it("deletes a template by id", async () => {
    const database = db();
    await saveTemplate(database, "child-1", tpl({}));
    await deleteTemplate(database, "child-1", "tpl-saturday");
    expect(await listTemplates(database, "child-1")).toHaveLength(0);
  });
});
