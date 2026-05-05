// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import { startTestEnv, ALLOWED_USER } from "../../tests/integration/firestore-test-utils";
import { createDay, getDay, getDayByDate, archiveDay, watchActiveDay } from "./days";
import type { Day } from "@/domain";

const baseDay = (overrides: Partial<Day>): Day => ({
  id: "day-1",
  childId: "child-1",
  date: "2026-05-05",
  status: "active",
  wakeTime: "07:00",
  createdAt: "2026-05-05T07:00:00Z",
  ...overrides,
});

describe("days repository", () => {
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

  it("creates and reads back a day", async () => {
    const day = baseDay({});
    await createDay(db(), day);
    expect(await getDay(db(), "child-1", "day-1")).toEqual(day);
  });

  it("finds a day by date", async () => {
    await createDay(db(), baseDay({ id: "d-1", date: "2026-05-04" }));
    await createDay(db(), baseDay({ id: "d-2", date: "2026-05-05" }));
    const found = await getDayByDate(db(), "child-1", "2026-05-05");
    expect(found?.id).toBe("d-2");
  });

  it("archives a day", async () => {
    await createDay(db(), baseDay({}));
    await archiveDay(db(), "child-1", "day-1", "2026-05-06T07:00:00Z");
    const archived = await getDay(db(), "child-1", "day-1");
    expect(archived?.status).toBe("archived");
    expect(archived?.archivedAt).toBe("2026-05-06T07:00:00Z");
  });

  it("watchActiveDay returns the unique day with status='active'", async () => {
    await createDay(db(), baseDay({ id: "d-1", date: "2026-05-04", status: "archived" }));
    await createDay(db(), baseDay({ id: "d-2", date: "2026-05-05", status: "active" }));

    const seen: (Day | null)[] = [];
    const unsub = watchActiveDay(db(), "child-1", (d) => seen.push(d));
    await new Promise((r) => setTimeout(r, 200));
    unsub();
    expect(seen.at(-1)?.id).toBe("d-2");
  });
});
