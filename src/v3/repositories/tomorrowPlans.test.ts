// @vitest-environment node
/**
 * V3 TomorrowPlan repository — Firestore CRUD against real emulator.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import {
  ALLOWED_USER,
  seedAllowedUser,
  startTestEnv,
} from "../../../tests/integration/firestore-test-utils";
import type { TomorrowPlan } from "../schemas";
import {
  confirmTomorrowPlan,
  deleteTomorrowPlan,
  loadTomorrowPlan,
  markPlanDraft,
  saveTomorrowPlan,
  watchTomorrowDraftCount,
  watchTomorrowPlan,
} from "./tomorrowPlans";

const aPlan = (overrides: Partial<TomorrowPlan> = {}): TomorrowPlan => ({
  childId: "aden",
  date: "2026-05-19",
  status: "draft",
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
    await seedAllowedUser(env, ALLOWED_USER.uid, ["aden"]);
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

  // Caller passes TimeMin so tests stay deterministic; prod stamps with
  // currentLocalMinutes().
  it("confirmTomorrowPlan flips a draft plan to confirmed and stamps confirmedAt", async () => {
    await saveTomorrowPlan(db(), "aden", aPlan({ status: "draft" }));
    await confirmTomorrowPlan(db(), "aden", "2026-05-19", 19 * 60 + 42);
    const got = await loadTomorrowPlan(db(), "aden", "2026-05-19");
    expect(got?.status).toBe("confirmed");
    expect(got?.confirmedAt).toBe(19 * 60 + 42);
  });

  // Called whenever the user edits a confirmed plan — they must re-confirm.
  it("markPlanDraft reverts a confirmed plan back to draft and clears confirmedAt", async () => {
    await saveTomorrowPlan(db(), "aden", aPlan({ status: "confirmed", confirmedAt: 19 * 60 + 42 }));
    await markPlanDraft(db(), "aden", "2026-05-19");
    const got = await loadTomorrowPlan(db(), "aden", "2026-05-19");
    expect(got?.status).toBe("draft");
    expect(got?.confirmedAt).toBeUndefined();
  });

  it("round-trips status, wakeTime, and confirmedAt", async () => {
    const plan = aPlan({
      status: "confirmed",
      wakeTime: 7 * 60 + 15,
      confirmedAt: 19 * 60 + 42,
    });
    await saveTomorrowPlan(db(), "aden", plan);
    const got = await loadTomorrowPlan(db(), "aden", "2026-05-19");
    expect(got?.status).toBe("confirmed");
    expect(got?.wakeTime).toBe(7 * 60 + 15);
    expect(got?.confirmedAt).toBe(19 * 60 + 42);
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

  // Subscription seam exercised against real emulator (backs the hooks).
  it("watchTomorrowPlan delivers null then the plan when it's written", async () => {
    const database = db();
    const seen: (TomorrowPlan | null)[] = [];
    const unsub = watchTomorrowPlan(database, "aden", "2026-05-19", (p) => seen.push(p));
    await new Promise((r) => setTimeout(r, 100));
    await saveTomorrowPlan(database, "aden", aPlan({ date: "2026-05-19", wakeTime: 7 * 60 }));
    await new Promise((r) => setTimeout(r, 200));
    unsub();
    expect(seen[0]).toBeNull(); // no doc yet on first snapshot
    const last = seen[seen.length - 1];
    expect(last?.wakeTime).toBe(7 * 60);
  });

  it("watchTomorrowDraftCount counts only draft plans, live", async () => {
    const database = db();
    const counts: number[] = [];
    const unsub = watchTomorrowDraftCount(database, "aden", (n) => counts.push(n));
    await new Promise((r) => setTimeout(r, 100));
    // Two drafts + one confirmed → count should settle at 2.
    await saveTomorrowPlan(database, "aden", aPlan({ date: "2026-05-19", status: "draft" }));
    await saveTomorrowPlan(database, "aden", aPlan({ date: "2026-05-20", status: "draft" }));
    await saveTomorrowPlan(database, "aden", aPlan({ date: "2026-05-21", status: "confirmed" }));
    await new Promise((r) => setTimeout(r, 200));
    unsub();
    expect(counts[0]).toBe(0); // empty collection on first snapshot
    expect(counts[counts.length - 1]).toBe(2);
  });
});
