// @vitest-environment node
/**
 * V3 events repository — Firestore CRUD against real emulator.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import {
  ALLOWED_USER,
  seedAllowedUser,
  startTestEnv,
} from "../../../tests/integration/firestore-test-utils";
import type { Event } from "../schemas";
import { NO_OWNER } from "../schemas";
import {
  createEvent,
  deleteEvent,
  listEvents,
  reconcileDuplicateEventDocs,
  updateEvent,
  watchEvents,
} from "./events";

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
  owner: NO_OWNER,
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
    await seedAllowedUser(env, ALLOWED_USER.uid, ["child-1"]);
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
        id: "e-recorded",
        type: "nap",
        kind: "block",
        startTime: 9 * 60,
        lifecycle: { state: "recorded", annotatedAt: 9 * 60 + 2 },
      }),
    );
    const listed = await listEvents(database, "child-1", "day-1");
    const got = listed.find((e) => e.id === "e-recorded");
    expect(got?.lifecycle).toEqual({ state: "recorded", annotatedAt: 9 * 60 + 2 });
  });

  it("round-trip: assigning then unassigning owner persists NO_OWNER (no stale value)", async () => {
    // Pre-fix, "unassign" sent a patch without `owner` — Firestore
    // updateDoc is field-merge so omitted fields are LEFT UNTOUCHED and the
    // prior owner survived. Fix: NO_OWNER = explicit { slot: "none" }, so
    // updateDoc always overwrites. Fails if the schema change is reverted.
    const database = db();
    await createEvent(database, "child-1", ev({ id: "e-owner-flip", owner: { slot: "parent1" } }));
    await updateEvent(database, "child-1", "day-1", "e-owner-flip", {
      owner: NO_OWNER,
    });
    const listed = await listEvents(database, "child-1", "day-1");
    const got = listed.find((e) => e.id === "e-owner-flip");
    expect(got?.owner).toEqual(NO_OWNER);
    // And the symmetric: assigning AFTER a NO_OWNER state works too.
    await updateEvent(database, "child-1", "day-1", "e-owner-flip", {
      owner: { slot: "parent2" },
    });
    const listed2 = await listEvents(database, "child-1", "day-1");
    const got2 = listed2.find((e) => e.id === "e-owner-flip");
    expect(got2?.owner).toEqual({ slot: "parent2" });
  });

  it("wake_window seam: two edits of the same projection collapse to ONE doc, last write wins", async () => {
    // onSave used to re-ID every projected→recorded transition with a
    // fresh random id. Multiple docs at the same eventKey made R4.2's tiebreak
    // nondeterministic. Fix: deterministic id (`recorded_${eventKey}`) routes
    // 2nd+ edits through updateOptimistic on the SAME doc.
    const database = db();
    const ww2Id = "recorded_wake_window_2";

    // Save 1: user picks parent1 on projected wake_window_2.
    await createEvent(
      database,
      "child-1",
      ev({
        id: ww2Id,
        type: "wake_window",
        kind: "block",
        eventKey: "wake_window_2",
        startTime: 0, // override docs carry sentinel startTime — R3.1 owns time
        endTime: 0,
        label: "Wake window 2",
        owner: { slot: "parent1" },
        lifecycle: { state: "recorded", annotatedAt: 8 * 60 },
      }),
    );

    // Save 2: user re-opens and switches to parent2. With the fix, this lands
    // on the SAME doc id via updateEvent — not a new random doc.
    await updateEvent(database, "child-1", "day-1", ww2Id, {
      owner: { slot: "parent2" },
    });

    const listed = await listEvents(database, "child-1", "day-1");
    const ww2Docs = listed.filter(
      (e) => e.type === "wake_window" && e.eventKey === "wake_window_2",
    );
    // The crux: exactly ONE override doc, not two.
    expect(ww2Docs).toHaveLength(1);
    expect(ww2Docs[0]!.owner).toEqual({ slot: "parent2" });

    // Save 3: user picks None. Same doc updated again.
    await updateEvent(database, "child-1", "day-1", ww2Id, {
      owner: NO_OWNER,
    });
    const listed2 = await listEvents(database, "child-1", "day-1");
    const ww2Docs2 = listed2.filter(
      (e) => e.type === "wake_window" && e.eventKey === "wake_window_2",
    );
    expect(ww2Docs2).toHaveLength(1);
    expect(ww2Docs2[0]!.owner).toEqual(NO_OWNER);
  });

  describe("reconcileDuplicateEventDocs (orphan cleanup)", () => {
    // NapActionButton wrote `id: nap_N` while useDrawer wrote
    // `id: recorded_nap_N` for the same slot — two Firestore docs, same
    // eventKey, different ids. Keeps the most-recent-annotation winner.
    it("deletes the loser when two docs share (type, eventKey); keeps the most-recent annotation", async () => {
      const database = db();
      // Drawer-edited orphan (older annotation).
      await createEvent(
        database,
        "child-1",
        ev({
          id: "recorded_nap_4",
          eventKey: "nap_4",
          type: "nap",
          kind: "block",
          startTime: 15 * 60,
          endTime: 15 * 60 + 45,
          label: "Nap 4",
          lifecycle: { state: "recorded", annotatedAt: 15 * 60 },
        }),
      );
      // Later Start-Nap-Now tap (newer annotation — the winner).
      await createEvent(
        database,
        "child-1",
        ev({
          id: "nap_4",
          eventKey: "nap_4",
          type: "nap",
          kind: "block",
          startTime: 15 * 60 + 35,
          label: "Nap 4",
          lifecycle: { state: "recorded", annotatedAt: 15 * 60 + 35 },
        }),
      );

      const { deleted } = await reconcileDuplicateEventDocs(database, "child-1", "day-1");

      expect(deleted).toEqual(["recorded_nap_4"]);

      const remaining = await listEvents(database, "child-1", "day-1");
      const naps = remaining.filter((e) => e.type === "nap" && e.eventKey === "nap_4");
      expect(naps).toHaveLength(1);
      expect(naps[0]!.id).toBe("nap_4");
      expect(naps[0]!.startTime).toBe(15 * 60 + 35);
    });

    it("is a no-op on a clean day (idempotent)", async () => {
      const database = db();
      await createEvent(database, "child-1", ev({ id: "e-a", eventKey: "bottle_1" }));
      await createEvent(database, "child-1", ev({ id: "e-b", eventKey: "bottle_2" }));

      const { deleted } = await reconcileDuplicateEventDocs(database, "child-1", "day-1");
      expect(deleted).toEqual([]);
      const remaining = await listEvents(database, "child-1", "day-1");
      expect(remaining).toHaveLength(2);
    });

    it("only collapses events sharing both type AND eventKey (different types pass through)", async () => {
      const database = db();
      // Same eventKey but different types — these are NOT duplicates.
      await createEvent(
        database,
        "child-1",
        ev({ id: "x-1", eventKey: "ambiguous", type: "bottle" }),
      );
      await createEvent(
        database,
        "child-1",
        ev({ id: "x-2", eventKey: "ambiguous", type: "extra" }),
      );

      const { deleted } = await reconcileDuplicateEventDocs(database, "child-1", "day-1");
      expect(deleted).toEqual([]);
      const remaining = await listEvents(database, "child-1", "day-1");
      expect(remaining).toHaveLength(2);
    });
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
