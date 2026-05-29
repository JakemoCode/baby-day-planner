// @vitest-environment node
/**
 * Midnight-rule routing (DOMAIN §2) — real emulator round-trip.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import {
  ALLOWED_USER,
  seedAllowedUser,
  startTestEnv,
} from "../../../tests/integration/firestore-test-utils";
import { NO_OWNER, type Day, type Event } from "../schemas";
import { createEventOnCalendarDay } from "./eventRouting";
import { createDay, getDayByDate } from "./days";
import { listEvents } from "./events";

const CHILD = "child-1";

const aDay = (overrides: Partial<Day>): Day => ({
  id: "day-x",
  childId: CHILD,
  date: "2026-05-10",
  status: "active",
  wakeTime: 7 * 60,
  suppressedRecurringIds: [],
  suppressedDaycareDay: false,
  suppressedDreamFeed: false,
  ...overrides,
});

const bottleAt2am = (dayId: string): Event => ({
  id: "b-2am",
  dayId,
  eventKey: "bottle_1",
  type: "bottle",
  kind: "instant",
  label: "Bottle 1",
  startTime: 2 * 60,
  amountOz: 4,
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "completed", committedAt: 2 * 60 },
});

describe("createEventOnCalendarDay — midnight routing (DOMAIN §2)", () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => {
    env = await startTestEnv();
  });
  afterAll(async () => {
    await env.cleanup();
  });
  beforeEach(async () => {
    await env.clearFirestore();
    await seedAllowedUser(env, ALLOWED_USER.uid, [CHILD]);
  });

  function db(): Firestore {
    const ctx = env.authenticatedContext(ALLOWED_USER.uid, { email: ALLOWED_USER.email });
    return ctx.firestore() as unknown as Firestore;
  }

  it("routes a post-midnight event to today's lazily-created day, not the stale active day", async () => {
    const database = db();
    await createDay(database, aDay({ id: "day-yesterday", date: "2026-05-10", status: "active" }));

    await createEventOnCalendarDay(
      database,
      CHILD,
      bottleAt2am("day-yesterday"),
      "2026-05-11",
      7 * 60,
    );

    const today = await getDayByDate(database, CHILD, "2026-05-11");
    expect(today).not.toBeNull();
    expect(today!.status).toBe("planned");

    const todayEvents = await listEvents(database, CHILD, today!.id);
    expect(todayEvents.find((e) => e.id === "b-2am")?.dayId).toBe(today!.id);

    const yesterdayEvents = await listEvents(database, CHILD, "day-yesterday");
    expect(yesterdayEvents.map((e) => e.id)).not.toContain("b-2am");
  });

  it("reuses the existing day doc when the calendar date already has one", async () => {
    const database = db();
    await createDay(database, aDay({ id: "day-today", date: "2026-05-11", status: "active" }));

    await createEventOnCalendarDay(database, CHILD, bottleAt2am("stale"), "2026-05-11", 7 * 60);

    const day = await getDayByDate(database, CHILD, "2026-05-11");
    expect(day!.id).toBe("day-today");
    const events = await listEvents(database, CHILD, "day-today");
    expect(events.find((e) => e.id === "b-2am")?.dayId).toBe("day-today");
  });
});
