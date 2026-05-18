// @vitest-environment node
/**
 * V3 TomorrowPlan repository — Firestore CRUD against real emulator.
 * §F39 PR #1: schema + repo, no UI/engine wiring yet.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import { ALLOWED_USER, startTestEnv } from "../../../tests/integration/firestore-test-utils";
import type { TomorrowPlan } from "../schemas";
import { deleteTomorrowPlan, loadTomorrowPlan, saveTomorrowPlan } from "./tomorrowPlans";

const aPlan = (overrides: Partial<TomorrowPlan> = {}): TomorrowPlan => ({
  childId: "aden",
  date: "2026-05-19",
  ownerOverrides: {},
  extras: [],
  ...overrides,
});

describe("v3 tomorrowPlans repository", () => {
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

  it("returns null when no plan exists for the date", async () => {
    const got = await loadTomorrowPlan(db(), "aden", "2026-05-19");
    expect(got).toBeNull();
  });

  it("saves and reloads an empty plan", async () => {
    const plan = aPlan();
    await saveTomorrowPlan(db(), "aden", plan);
    const got = await loadTomorrowPlan(db(), "aden", "2026-05-19");
    expect(got).toEqual(plan);
  });

  it("round-trips ownerOverrides including null = explicit None", async () => {
    const plan = aPlan({
      ownerOverrides: {
        nap_1: { slot: "parent1" },
        nap_2: null,
        bottle_3: { slot: "other", otherId: "daycare-uuid" },
      },
    });
    await saveTomorrowPlan(db(), "aden", plan);
    const got = await loadTomorrowPlan(db(), "aden", "2026-05-19");
    expect(got?.ownerOverrides).toEqual({
      nap_1: { slot: "parent1" },
      nap_2: null,
      bottle_3: { slot: "other", otherId: "daycare-uuid" },
    });
  });

  it("round-trips extras and the optional startTemplateId", async () => {
    const plan = aPlan({
      startTemplateId: "tpl-saturday",
      extras: [
        {
          id: "extra-1",
          dayId: "day-2026-05-19",
          eventKey: "extra-1",
          type: "extra",
          kind: "instant",
          startTime: 13 * 60 + 30,
          label: "Grocery run",
          owner: { slot: "none" },
          hasPutdown: false,
          lifecycle: { state: "projected" },
        },
      ],
    });
    await saveTomorrowPlan(db(), "aden", plan);
    const got = await loadTomorrowPlan(db(), "aden", "2026-05-19");
    expect(got?.startTemplateId).toBe("tpl-saturday");
    expect(got?.extras).toHaveLength(1);
    expect(got?.extras[0]?.label).toBe("Grocery run");
  });

  it("deletes the doc — next load returns null", async () => {
    await saveTomorrowPlan(db(), "aden", aPlan());
    await deleteTomorrowPlan(db(), "aden", "2026-05-19");
    const got = await loadTomorrowPlan(db(), "aden", "2026-05-19");
    expect(got).toBeNull();
  });

  it("keeps plans for different dates independent", async () => {
    await saveTomorrowPlan(db(), "aden", aPlan({ date: "2026-05-19" }));
    await saveTomorrowPlan(
      db(),
      "aden",
      aPlan({ date: "2026-05-20", startTemplateId: "tpl-sunday" }),
    );
    const a = await loadTomorrowPlan(db(), "aden", "2026-05-19");
    const b = await loadTomorrowPlan(db(), "aden", "2026-05-20");
    expect(a?.startTemplateId).toBeUndefined();
    expect(b?.startTemplateId).toBe("tpl-sunday");
  });
});
