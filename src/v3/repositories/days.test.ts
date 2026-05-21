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
import {
  ALLOWED_USER,
  seedAllowedUser,
  startTestEnv,
} from "../../../tests/integration/firestore-test-utils";
import type { Day, Event } from "../schemas";
import { NO_OWNER } from "../schemas";
import { createEvent, listEvents } from "./events";
import {
  archiveDay,
  createDay,
  getDay,
  getDayByDate,
  listArchivedDays,
  startNewDay,
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
    await seedAllowedUser(env, ALLOWED_USER.uid, ["child-1"]);
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

  // C2 from /design-audit 2026-05-20: /history showed three rows all titled
  // "Wed, May 20" because Jake had hit Start New Day multiple times on the
  // same calendar date during dogfood. `startNewDay` mints `day-${date}-${Date.now()}`
  // IDs so the docs are distinct, but their `date` field collides. The repo
  // is the right layer to dedupe — the invariant "one history row per
  // calendar day" belongs here, not at every consumer.
  it("dedupes archived days by date, keeping the most recently created", async () => {
    const database = db();
    // Same date, three different IDs. IDs sort lexicographically; the
    // numerically-greater suffix (more recent Date.now()) wins.
    await createDay(
      database,
      day({ id: "day-2026-05-20-1000", date: "2026-05-20", status: "archived" }),
    );
    await createDay(
      database,
      day({ id: "day-2026-05-20-3000", date: "2026-05-20", status: "archived" }),
    );
    await createDay(
      database,
      day({ id: "day-2026-05-20-2000", date: "2026-05-20", status: "archived" }),
    );
    // Plus a distinct earlier date to confirm normal ordering still works.
    await createDay(
      database,
      day({ id: "day-2026-05-19-1000", date: "2026-05-19", status: "archived" }),
    );

    const list = await listArchivedDays(database, "child-1");
    expect(list).toHaveLength(2);
    expect(list[0]?.date).toBe("2026-05-20");
    expect(list[0]?.id).toBe("day-2026-05-20-3000"); // newest of the three dupes
    expect(list[1]?.date).toBe("2026-05-19");
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

  // -------------------------------------------------------------------------
  // startNewDay (PR-A0.2)
  // -------------------------------------------------------------------------

  it("startNewDay creates a V3-shape active day with TimeMin wakeTime", async () => {
    const database = db();
    const result = await startNewDay(database, "child-1", {
      newDayId: "day-new",
      newDate: "2026-05-09",
      newWakeTime: 7 * 60 + 30,
    });
    expect(result.newDayId).toBe("day-new");
    expect(result.archivedDayId).toBeNull();

    const got = await getDay(database, "child-1", "day-new");
    expect(got).not.toBeNull();
    expect(got!.status).toBe("active");
    expect(got!.wakeTime).toBe(7 * 60 + 30);
    expect(got!.suppressedRecurringIds).toEqual([]);
    expect(got!.suppressedDaycareDay).toBe(false);
    // V3 schema doesn't carry archivedAt or createdAt — confirm absent
    expect("archivedAt" in (got as object)).toBe(false);
    expect("createdAt" in (got as object)).toBe(false);
  });

  it("startNewDay archives the previous active day in the same call", async () => {
    const database = db();
    await createDay(database, day({ id: "day-yesterday", date: "2026-05-08" }));
    const result = await startNewDay(database, "child-1", {
      newDayId: "day-today",
      newDate: "2026-05-09",
      newWakeTime: 7 * 60 + 15,
    });
    expect(result.archivedDayId).toBe("day-yesterday");

    const yesterday = await getDay(database, "child-1", "day-yesterday");
    expect(yesterday?.status).toBe("archived");

    const today = await getDay(database, "child-1", "day-today");
    expect(today?.status).toBe("active");
  });

  it("startNewDay carries templateId when provided", async () => {
    const database = db();
    await startNewDay(database, "child-1", {
      newDayId: "day-with-tpl",
      newDate: "2026-05-09",
      newWakeTime: 7 * 60,
      templateId: "tpl-saturday",
    });
    const got = await getDay(database, "child-1", "day-with-tpl");
    expect(got?.templateId).toBe("tpl-saturday");
  });

  it("startNewDay omits templateId when not provided", async () => {
    const database = db();
    await startNewDay(database, "child-1", {
      newDayId: "day-no-tpl",
      newDate: "2026-05-09",
      newWakeTime: 7 * 60,
    });
    const got = await getDay(database, "child-1", "day-no-tpl");
    expect(got).not.toBeNull();
    expect("templateId" in (got as object)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // startNewDay trims the previous day's in-progress bedtime so the
  // overnight sleep block visually meets the wake event instead of
  // overshooting to R7.1's defaultWakeTime placeholder.
  // -------------------------------------------------------------------------

  const recordedBedtime = (overrides: Partial<Event> = {}): Event => ({
    id: "bedtime",
    dayId: "day-yesterday",
    eventKey: "bedtime",
    type: "bedtime",
    kind: "block",
    label: "Bedtime",
    startTime: 20 * 60, // 8 PM
    endTime: 7 * 60 + 24 * 60, // next-morning 7 AM placeholder
    hasPutdown: false,
    owner: NO_OWNER,
    lifecycle: { state: "recorded", annotatedAt: 20 * 60 },
    ...overrides,
  });

  it("startNewDay trims a recorded bedtime in the archived day to newWakeTime (+24h frame)", async () => {
    const database = db();
    await createDay(database, day({ id: "day-yesterday", date: "2026-05-08" }));
    await createEvent(database, "child-1", recordedBedtime());

    await startNewDay(database, "child-1", {
      newDayId: "day-today",
      newDate: "2026-05-09",
      newWakeTime: 6 * 60 + 15, // 6:15 AM
    });

    const events = await listEvents(database, "child-1", "day-yesterday");
    const bedtime = events.find((e) => e.type === "bedtime");
    expect(bedtime).toBeDefined();
    // Trimmed to newWakeTime in the OLD day's frame (+24h).
    expect(bedtime!.endTime).toBe(6 * 60 + 15 + 24 * 60);
    expect(bedtime!.lifecycle.state).toBe("completed");
  });

  it("startNewDay leaves an already-completed bedtime alone (user-set endTime is authoritative)", async () => {
    const database = db();
    await createDay(database, day({ id: "day-yesterday", date: "2026-05-08" }));
    const userEnd = 5 * 60 + 30 + 24 * 60; // user explicitly ended bedtime at 5:30a
    await createEvent(
      database,
      "child-1",
      recordedBedtime({
        endTime: userEnd,
        lifecycle: { state: "completed", committedAt: userEnd },
      }),
    );

    await startNewDay(database, "child-1", {
      newDayId: "day-today",
      newDate: "2026-05-09",
      newWakeTime: 7 * 60, // 7:00 — would clobber the 5:30 if we touched it
    });

    const events = await listEvents(database, "child-1", "day-yesterday");
    const bedtime = events.find((e) => e.type === "bedtime");
    expect(bedtime!.endTime).toBe(userEnd);
    expect(bedtime!.lifecycle.state).toBe("completed");
  });

  it("startNewDay is a no-op for bedtime trim when the archived day has no bedtime", async () => {
    const database = db();
    await createDay(database, day({ id: "day-yesterday", date: "2026-05-08" }));
    // No bedtime event seeded.
    await startNewDay(database, "child-1", {
      newDayId: "day-today",
      newDate: "2026-05-09",
      newWakeTime: 7 * 60,
    });
    // Archive completed; new day created. Just confirm the call didn't throw.
    const yesterday = await getDay(database, "child-1", "day-yesterday");
    expect(yesterday?.status).toBe("archived");
  });

  // -------------------------------------------------------------------------
  // Write→Watch seam (audit P0-2): `startNewDay` writes → `watchActiveDay`
  // delivers the new day to the listener. The page's wake-gate failure
  // mode shipped today was masked by this seam being untested — each
  // half worked in isolation but the chain wasn't exercised end-to-end.
  // -------------------------------------------------------------------------

  describe("startNewDay → watchActiveDay seam", () => {
    it("after startNewDay, the listener delivers the new day with full V3 shape (wakeTime, defaults applied)", async () => {
      const database = db();
      const deliveries: (Day | null)[] = [];
      const unsub = watchActiveDay(database, "child-1", (d) => deliveries.push(d));
      // Let the initial empty-state snapshot drain before writing.
      await new Promise((r) => setTimeout(r, 100));

      await startNewDay(database, "child-1", {
        newDayId: "day-fresh",
        newDate: "2026-05-12",
        newWakeTime: 7 * 60 + 30,
      });
      // Wait for the snapshot to propagate.
      await new Promise((r) => setTimeout(r, 200));
      unsub();

      // Final delivered state is the new active day, fully shaped.
      const last = deliveries[deliveries.length - 1];
      expect(last).not.toBeNull();
      expect(last!.id).toBe("day-fresh");
      expect(last!.status).toBe("active");
      // The wake-gate bug today hinged on wakeTime being delivered: if the
      // converter strips it or the writer omits it, the page's
      // `day.wakeTime === undefined` check fires forever after Start Day.
      expect(last!.wakeTime).toBe(7 * 60 + 30);
      // Defaulter fields are present (engine relies on these).
      expect(last!.suppressedRecurringIds).toEqual([]);
      expect(last!.suppressedDaycareDay).toBe(false);
    });

    it("after startNewDay with a pre-existing active day, listener delivers ONLY the new day (old archived no longer matches)", async () => {
      const database = db();
      await createDay(database, day({ id: "day-yesterday", date: "2026-05-11" }));

      const deliveries: (Day | null)[] = [];
      const unsub = watchActiveDay(database, "child-1", (d) => deliveries.push(d));
      // Initial delivery should be day-yesterday (the only active day).
      await new Promise((r) => setTimeout(r, 100));
      expect(deliveries[deliveries.length - 1]?.id).toBe("day-yesterday");

      await startNewDay(database, "child-1", {
        newDayId: "day-today",
        newDate: "2026-05-12",
        newWakeTime: 7 * 60,
      });
      await new Promise((r) => setTimeout(r, 200));
      unsub();

      // Final delivered state is the NEW day, not the now-archived old one.
      const last = deliveries[deliveries.length - 1];
      expect(last?.id).toBe("day-today");
      expect(last?.status).toBe("active");
    });
  });
});
