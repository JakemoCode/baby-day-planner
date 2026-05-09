// @vitest-environment node
/**
 * V3 days repository — Firestore CRUD against real emulator.
 * Mirrors V2's surface (src/repositories/days.ts) so cutover at
 * consumer sites is an import swap. Shape difference: V3 Day has
 * TimeMin `wakeTime` (number, optional) plus the per-day suppression
 * arrays for recurring + daycare.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import { ALLOWED_USER, startTestEnv } from "../../../tests/integration/firestore-test-utils";
import type { Day } from "../schemas";
import {
  archiveDay,
  createDay,
  getDay,
  getDayByDate,
  listArchivedDays,
  updateDay,
  watchActiveDay,
} from "./days";

const day = (overrides: Partial<Day>): Day => ({
  id: "day-1",
  childId: "child-1",
  date: "2026-05-09",
  status: "active",
  suppressedRecurringIds: [],
  suppressedDaycareDay: false,
  ...overrides,
});

describe("v3 days repository", () => {
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

  it("creates and reads a day by id", async () => {
    const database = db();
    await createDay(database, day({}));
    const got = await getDay(database, "child-1", "day-1");
    expect(got?.date).toBe("2026-05-09");
    expect(got?.suppressedDaycareDay).toBe(false);
  });

  it("returns null when reading a missing day", async () => {
    expect(await getDay(db(), "child-1", "ghost")).toBeNull();
  });

  it("looks up a day by date", async () => {
    const database = db();
    await createDay(database, day({ id: "day-A", date: "2026-05-08", status: "archived" }));
    await createDay(database, day({ id: "day-B", date: "2026-05-09" }));
    const got = await getDayByDate(database, "child-1", "2026-05-09");
    expect(got?.id).toBe("day-B");
  });

  it("returns null from getDayByDate when date is unknown", async () => {
    expect(await getDayByDate(db(), "child-1", "2099-12-31")).toBeNull();
  });

  it("patches a day with TimeMin wakeTime", async () => {
    const database = db();
    await createDay(database, day({}));
    await updateDay(database, "child-1", "day-1", { wakeTime: 7 * 60 + 5 });
    const got = await getDay(database, "child-1", "day-1");
    expect(got?.wakeTime).toBe(7 * 60 + 5);
  });

  it("archives by flipping status", async () => {
    const database = db();
    await createDay(database, day({}));
    await archiveDay(database, "child-1", "day-1");
    const got = await getDay(database, "child-1", "day-1");
    expect(got?.status).toBe("archived");
  });

  it("lists archived days, most recent first", async () => {
    const database = db();
    await createDay(database, day({ id: "d-1", date: "2026-05-01", status: "archived" }));
    await createDay(database, day({ id: "d-2", date: "2026-05-03", status: "archived" }));
    await createDay(database, day({ id: "d-3", date: "2026-05-02", status: "archived" }));
    await createDay(database, day({ id: "d-active", date: "2026-05-04", status: "active" }));
    const list = await listArchivedDays(database, "child-1");
    expect(list.map((d) => d.id)).toEqual(["d-2", "d-3", "d-1"]);
  });

  it("watches the active day and updates on change", async () => {
    const database = db();
    const seen: (Day | null)[] = [];
    const unsub = watchActiveDay(database, "child-1", (d) => seen.push(d));
    await new Promise((r) => setTimeout(r, 100));
    await createDay(database, day({}));
    await new Promise((r) => setTimeout(r, 200));
    unsub();
    const last = seen[seen.length - 1];
    expect(last?.id).toBe("day-1");
  });
});
