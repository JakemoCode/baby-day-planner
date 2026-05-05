// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import { startTestEnv, ALLOWED_USER } from "../../tests/integration/firestore-test-utils";
import { createDay, getDay, getDayByDate } from "./days";
import { startNewDay } from "./startNewDay";
import type { Day } from "@/domain";

const baseDay = (overrides: Partial<Day>): Day => ({
  id: "day-prev",
  childId: "child-1",
  date: "2026-05-04",
  status: "active",
  wakeTime: "07:00",
  createdAt: "2026-05-04T07:00:00Z",
  ...overrides,
});

describe("startNewDay", () => {
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

  it("archives current active day and creates a new active day", async () => {
    await createDay(db(), baseDay({}));

    const result = await startNewDay(db(), "child-1", {
      newDayId: "day-new",
      newDate: "2026-05-05",
      newWakeTime: "07:15",
      ownershipTemplateId: "tmpl-sunday",
      now: "2026-05-05T07:15:00Z",
    });

    expect(result.archivedDayId).toBe("day-prev");
    expect(result.newDayId).toBe("day-new");

    const archived = await getDay(db(), "child-1", "day-prev");
    expect(archived?.status).toBe("archived");
    expect(archived?.archivedAt).toBe("2026-05-05T07:15:00Z");

    const created = await getDayByDate(db(), "child-1", "2026-05-05");
    expect(created?.status).toBe("active");
    expect(created?.wakeTime).toBe("07:15");
    expect(created?.ownershipTemplateId).toBe("tmpl-sunday");
  });

  it("creates a new active day with no prior day to archive", async () => {
    const result = await startNewDay(db(), "child-1", {
      newDayId: "day-new",
      newDate: "2026-05-05",
      newWakeTime: "07:00",
      now: "2026-05-05T07:00:00Z",
    });

    expect(result.archivedDayId).toBeNull();
    const created = await getDayByDate(db(), "child-1", "2026-05-05");
    expect(created?.status).toBe("active");
  });
});
