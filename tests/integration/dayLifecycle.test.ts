// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import { startTestEnv, ALLOWED_USER } from "./firestore-test-utils";
import { saveSettings } from "@/repositories/settings";
import { createDay, getDayByDate } from "@/repositories/days";
import { createEvent, listEvents } from "@/repositories/events";
import { startNewDay } from "@/repositories/startNewDay";
import { sampleSettings } from "@/domain/__fixtures__/sample";
import type { Event } from "@/domain";

describe("full day lifecycle", () => {
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

  it("seeds settings, runs a day, and rolls over to the next", async () => {
    // 1. Seed settings
    await saveSettings(db(), "child-1", sampleSettings);

    // 2. Create today's day
    await createDay(db(), {
      id: "day-today",
      childId: "child-1",
      date: "2026-05-05",
      status: "active",
      wakeTime: "07:00",
      createdAt: "2026-05-05T07:00:00Z",
    });

    // 3. Log Bottle 1 actual + Nap 1 actual
    const bottle1: Event = {
      id: "ev-bottle-1",
      dayId: "day-today",
      eventKey: "bottle_1",
      type: "bottle",
      label: "Bottle 1",
      startTime: "07:05",
      amountOz: 5,
      source: "actual",
      status: "actual",
    };
    const nap1: Event = {
      id: "ev-nap-1",
      dayId: "day-today",
      eventKey: "nap_1",
      type: "nap",
      label: "Nap 1",
      startTime: "09:10",
      endTime: "10:15",
      source: "actual",
      status: "actual",
    };
    await createEvent(db(), "child-1", bottle1);
    await createEvent(db(), "child-1", nap1);

    const events = await listEvents(db(), "child-1", "day-today");
    expect(events).toHaveLength(2);

    // 4. Roll over to tomorrow
    const result = await startNewDay(db(), "child-1", {
      newDayId: "day-tomorrow",
      newDate: "2026-05-06",
      newWakeTime: "07:00",
      now: "2026-05-06T07:00:00Z",
    });
    expect(result.archivedDayId).toBe("day-today");

    // 5. New day is empty
    const tomorrow = await getDayByDate(db(), "child-1", "2026-05-06");
    expect(tomorrow?.status).toBe("active");
    const tomorrowEvents = await listEvents(db(), "child-1", "day-tomorrow");
    expect(tomorrowEvents).toHaveLength(0);

    // 6. Yesterday's events still exist on yesterday (preserved)
    const yesterdayEvents = await listEvents(db(), "child-1", "day-today");
    expect(yesterdayEvents).toHaveLength(2);
  });
});
