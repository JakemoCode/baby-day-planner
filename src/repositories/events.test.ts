// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import { startTestEnv, ALLOWED_USER } from "../../tests/integration/firestore-test-utils";
import { createEvent, deleteEvent, listEvents, updateEvent, watchEvents } from "./events";
import type { Event } from "@/domain";

const ev = (overrides: Partial<Event>): Event => ({
  id: "e-1",
  dayId: "day-1",
  eventKey: "bottle_1",
  type: "bottle",
  label: "Bottle 1",
  startTime: "07:05",
  amountOz: 5,
  source: "actual",
  status: "actual",
  ...overrides,
});

describe("events repository", () => {
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

  it("creates, lists, updates, and deletes events", async () => {
    const database = db();
    await createEvent(database, "child-1", ev({}));
    await createEvent(
      database,
      "child-1",
      ev({
        id: "e-2",
        eventKey: "nap_1",
        type: "nap",
        startTime: "09:00",
        endTime: "10:00",
        label: "Nap 1",
      }),
    );

    let listed = await listEvents(database, "child-1", "day-1");
    expect(listed).toHaveLength(2);

    await updateEvent(database, "child-1", "day-1", "e-1", { amountOz: 6 });
    listed = await listEvents(database, "child-1", "day-1");
    expect(listed.find((e) => e.id === "e-1")?.amountOz).toBe(6);

    await deleteEvent(database, "child-1", "day-1", "e-2");
    listed = await listEvents(database, "child-1", "day-1");
    expect(listed).toHaveLength(1);
  });

  it("watches events ordered by startTime", async () => {
    const database = db();
    await createEvent(database, "child-1", ev({ id: "e-1", startTime: "10:00" }));
    await createEvent(database, "child-1", ev({ id: "e-2", startTime: "07:00" }));
    await createEvent(database, "child-1", ev({ id: "e-3", startTime: "12:00" }));

    const seen: Event[][] = [];
    const unsub = watchEvents(database, "child-1", "day-1", (events) => seen.push(events));
    await new Promise((r) => setTimeout(r, 200));
    unsub();
    const last = seen.at(-1)!;
    expect(last.map((e) => e.id)).toEqual(["e-2", "e-1", "e-3"]);
  });
});
