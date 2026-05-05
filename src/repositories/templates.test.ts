// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import { startTestEnv, ALLOWED_USER } from "../../tests/integration/firestore-test-utils";
import { listTemplates, saveTemplate, deleteTemplate } from "./templates";
import type { OwnershipTemplate } from "@/domain";

const t = (id: string, label: string): OwnershipTemplate => ({
  id,
  label,
  napOwners: ["Jake", "Kelly"],
  wakeWindowOwners: ["Kelly", "Jake"],
});

describe("templates repository", () => {
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

  it("saves, lists, and deletes templates", async () => {
    await saveTemplate(db(), "child-1", t("tmpl-saturday", "Saturday"));
    await saveTemplate(db(), "child-1", t("tmpl-sunday", "Sunday"));
    let listed = await listTemplates(db(), "child-1");
    expect(listed.map((x) => x.id).sort()).toEqual(["tmpl-saturday", "tmpl-sunday"]);

    await deleteTemplate(db(), "child-1", "tmpl-sunday");
    listed = await listTemplates(db(), "child-1");
    expect(listed).toHaveLength(1);
  });
});
