// @vitest-environment node
/**
 * V3 events repository — Firestore CRUD against real emulator.
 *
 * Mirrors the V2 events repo test (src/repositories/events.test.ts) so
 * the cutover at consumer sites stays a one-import-line change. Shape
 * difference: V3 events use TimeMin (number) for startTime/endTime and
 * a discriminated `lifecycle` union.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import { ALLOWED_USER, startTestEnv } from "../../../tests/integration/firestore-test-utils";
import type { Event } from "../schemas";
import { createEvent, deleteEvent, listEvents, updateEvent, watchEvents } from "./events";

const ev = (overrides: Partial<Event>): Event => ({
  id: "e-1",
  dayId: "day-1",
  eventKey: "bottle_1",
  type: "bottle",
  kind: "instant",
  startTime: 7 * 60 + 5,
  label: "Bottle 1",
  amountOz: 5,
  hasPutdown: false,
  lifecycle: { state: "completed", committedAt: 7 * 60 + 5 },
  ...overrides,
});

describe("v3 events repository", () => {
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

  it("creates, lists, updates, and deletes events with V3 shape", async () => {
    const database = db();
    await createEvent(database, "child-1", ev({}));
    await createEvent(
      database,
      "child-1",
      ev({
        id: "e-2",
        eventKey: "nap_1",
        type: "nap",
        kind: "block",
        startTime: 9 * 60,
        endTime: 10 * 60,
        label: "Nap 1",
        lifecycle: { state: "completed", committedAt: 10 * 60 },
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

  it("round-trips lifecycle discriminated union without flattening", async () => {
    const database = db();
    await createEvent(
      database,
      "child-1",
      ev({
        id: "e-started",
        type: "nap",
        kind: "block",
        startTime: 9 * 60,
        lifecycle: { state: "started", committedAt: 9 * 60 + 2 },
      }),
    );
    const listed = await listEvents(database, "child-1", "day-1");
    const got = listed.find((e) => e.id === "e-started");
    expect(got?.lifecycle).toEqual({ state: "started", committedAt: 9 * 60 + 2 });
  });

  it("watches events ordered by startTime", async () => {
    const database = db();
    await createEvent(database, "child-1", ev({ id: "e-1", startTime: 10 * 60 }));
    await createEvent(database, "child-1", ev({ id: "e-2", startTime: 7 * 60 }));
    await createEvent(database, "child-1", ev({ id: "e-3", startTime: 12 * 60 }));

    const seen: Event[][] = [];
    const unsub = watchEvents(database, "child-1", "day-1", (events) => seen.push(events));
    await new Promise((r) => setTimeout(r, 200));
    unsub();

    const final = seen[seen.length - 1];
    expect(final?.map((e) => e.id)).toEqual(["e-2", "e-1", "e-3"]);
  });
});
