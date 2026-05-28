// @vitest-environment node
/**
 * V3 days repository — Firestore CRUD against real emulator.
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
  editWakeTime,
  getDay,
  getDayByDate,
  getOrCreatePlannedDay,
  listArchivedDays,
  promoteFromPlan,
  startNewDay,
  suppressDaycareForDay,
  suppressDreamFeedForDay,
  suppressRecurringForDay,
  updateDay,
  updateDayOwnerOverride,
  watchActiveDay,
} from "./days";
import type { TomorrowPlan } from "../schemas";

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

  // null in ownerOverrides = explicit NO_OWNER (user unassigned a slot).
  it("round-trips ownerOverrides including null = explicit unassigned", async () => {
    const database = db();
    await createDay(
      database,
      day({
        ownerOverrides: {
          nap_1: { slot: "parent1" },
          nap_2: null,
          bottle_3: { slot: "other", otherId: "daycare-uuid" },
        },
      }),
    );
    const got = await getDay(database, "child-1", "day-1");
    expect(got?.ownerOverrides).toEqual({
      nap_1: { slot: "parent1" },
      nap_2: null,
      bottle_3: { slot: "other", otherId: "daycare-uuid" },
    });
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

  // Owner-only edits route to Day.ownerOverrides (not the events collection)
  // so the engine remains free to re-project the event's time.
  it("updateDayOwnerOverride merges into existing ownerOverrides map (does not replace)", async () => {
    const database = db();
    await createDay(database, day({ ownerOverrides: { nap_1: { slot: "parent1" } } }));
    await updateDayOwnerOverride(database, "child-1", "day-1", "nap_2", {
      slot: "parent2",
    });
    const got = await getDay(database, "child-1", "day-1");
    // Both entries present — dot-notation update merges into the map.
    expect(got?.ownerOverrides).toEqual({
      nap_1: { slot: "parent1" },
      nap_2: { slot: "parent2" },
    });
  });

  it("updateDayOwnerOverride creates ownerOverrides field when missing", async () => {
    const database = db();
    await createDay(database, day({})); // no ownerOverrides on the doc
    await updateDayOwnerOverride(database, "child-1", "day-1", "bottle_3", {
      slot: "parent1",
    });
    const got = await getDay(database, "child-1", "day-1");
    expect(got?.ownerOverrides).toEqual({ bottle_3: { slot: "parent1" } });
  });

  it("updateDayOwnerOverride can change an existing entry", async () => {
    const database = db();
    await createDay(database, day({ ownerOverrides: { nap_1: { slot: "parent1" } } }));
    await updateDayOwnerOverride(database, "child-1", "day-1", "nap_1", {
      slot: "parent2",
    });
    const got = await getDay(database, "child-1", "day-1");
    expect(got?.ownerOverrides).toEqual({ nap_1: { slot: "parent2" } });
  });

  // Routes through Day.suppressedRecurringIds (R11.6) — Settings.dailyRecurring
  // stays intact so the recurring re-appears tomorrow.
  it("suppressRecurringForDay adds a recurring id to an empty suppression list", async () => {
    const database = db();
    await createDay(database, day({ suppressedRecurringIds: [] }));
    await suppressRecurringForDay(database, "child-1", "day-1", "rec-tummy");
    const got = await getDay(database, "child-1", "day-1");
    expect(got?.suppressedRecurringIds).toEqual(["rec-tummy"]);
  });

  it("suppressRecurringForDay preserves existing ids when adding a new one", async () => {
    const database = db();
    await createDay(database, day({ suppressedRecurringIds: ["rec-vitamin"] }));
    await suppressRecurringForDay(database, "child-1", "day-1", "rec-tummy");
    const got = await getDay(database, "child-1", "day-1");
    expect(got?.suppressedRecurringIds?.sort()).toEqual(["rec-tummy", "rec-vitamin"]);
  });

  it("suppressRecurringForDay is idempotent — adding the same id twice keeps one entry", async () => {
    const database = db();
    await createDay(database, day({ suppressedRecurringIds: ["rec-tummy"] }));
    await suppressRecurringForDay(database, "child-1", "day-1", "rec-tummy");
    const got = await getDay(database, "child-1", "day-1");
    expect(got?.suppressedRecurringIds).toEqual(["rec-tummy"]);
  });

  // Flips Day.suppressedDaycareDay (R21.5) without touching Settings.daycare.
  it("suppressDaycareForDay flips suppressedDaycareDay to true", async () => {
    const database = db();
    await createDay(database, day({ suppressedDaycareDay: false }));
    await suppressDaycareForDay(database, "child-1", "day-1");
    const got = await getDay(database, "child-1", "day-1");
    expect(got?.suppressedDaycareDay).toBe(true);
  });

  it("suppressDaycareForDay is idempotent — flipping when already true is a no-op", async () => {
    const database = db();
    await createDay(database, day({ suppressedDaycareDay: true }));
    await suppressDaycareForDay(database, "child-1", "day-1");
    const got = await getDay(database, "child-1", "day-1");
    expect(got?.suppressedDaycareDay).toBe(true);
  });

  // Routes through Day.suppressedDreamFeed; R5.5 stops emitting the slot.
  it("suppressDreamFeedForDay flips suppressedDreamFeed to true", async () => {
    const database = db();
    await createDay(database, day({ suppressedDreamFeed: false }));
    await suppressDreamFeedForDay(database, "child-1", "day-1");
    const got = await getDay(database, "child-1", "day-1");
    expect(got?.suppressedDreamFeed).toBe(true);
  });

  it("suppressDreamFeedForDay is idempotent — flipping when already true is a no-op", async () => {
    const database = db();
    await createDay(database, day({ suppressedDreamFeed: true }));
    await suppressDreamFeedForDay(database, "child-1", "day-1");
    const got = await getDay(database, "child-1", "day-1");
    expect(got?.suppressedDreamFeed).toBe(true);
  });

  // Previously minted `day-${date}-${Date.now()}` ids, racing concurrent
  // overnight saves into duplicate docs. Deterministic id → idempotent setDoc.
  it("getOrCreatePlannedDay uses a deterministic id and is idempotent under repeat calls", async () => {
    const database = db();
    const d1 = await getOrCreatePlannedDay(database, "child-1", "2026-06-01", 7 * 60);
    const d2 = await getOrCreatePlannedDay(database, "child-1", "2026-06-01", 7 * 60);
    expect(d1.id).toBe("day-child-1-2026-06-01");
    expect(d2.id).toBe(d1.id);
    expect(d2.status).toBe("planned");
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

  // Dogfood: /history showed duplicate rows for the same date when Start New
  // Day was hit multiple times. The invariant "one row per calendar day" belongs
  // at the repo layer; each consumer shouldn't dedupe independently.
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

  // Deterministic `day-${childId}-${date}` id makes concurrent rollover
  // safe — both clients write the same doc id via idempotent setDoc.
  it("derives a deterministic id when newDayId is omitted", async () => {
    const database = db();
    const result = await startNewDay(database, "child-1", {
      newDate: "2026-05-21",
      newWakeTime: 7 * 60,
    });
    expect(result.newDayId).toBe("day-child-1-2026-05-21");
    const got = await getDay(database, "child-1", "day-child-1-2026-05-21");
    expect(got?.date).toBe("2026-05-21");
    expect(got?.status).toBe("active");
  });

  it("idempotent under repeat calls for same (childId, date)", async () => {
    const database = db();
    const r1 = await startNewDay(database, "child-1", {
      newDate: "2026-05-21",
      newWakeTime: 7 * 60,
    });
    const r2 = await startNewDay(database, "child-1", {
      newDate: "2026-05-21",
      newWakeTime: 7 * 60,
    });
    expect(r1.newDayId).toBe(r2.newDayId);

    // Only one active doc for the date — second call did not create a duplicate
    // (would have collided with the first's id). Active across the whole child:
    const list = await listArchivedDays(database, "child-1");
    const activeDocsForDate = list.filter((d) => d.date === "2026-05-21");
    expect(activeDocsForDate).toHaveLength(0); // active, not archived

    const got = await getDay(database, "child-1", r1.newDayId);
    expect(got?.status).toBe("active");
  });

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
  // startNewDay trims the previous day's in-progress bedtime (R7.1) so the
  // overnight block meets the wake event rather than overshooting to the
  // defaultWakeTime placeholder.
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
  // editWakeTime — must also close any in-progress overnight bedtime in
  // today's events, otherwise the dashboard shows "Bedtime in progress"
  // indefinitely after the user sets wakeTime.
  // -------------------------------------------------------------------------

  it("editWakeTime updates Day.wakeTime AND trims an in-progress bedtime in today's events", async () => {
    const database = db();
    await createDay(database, day({ id: "day-today", wakeTime: 7 * 60 }));
    // Yesterday's bedtime ended up on today's events (the dashboard's
    // inProgressBedtime query reads from today's actuals).
    await createEvent(database, "child-1", recordedBedtime({ dayId: "day-today" }));

    await editWakeTime(database, "child-1", "day-today", 6 * 60);

    const got = await getDay(database, "child-1", "day-today");
    expect(got?.wakeTime).toBe(6 * 60);

    const events = await listEvents(database, "child-1", "day-today");
    const bedtime = events.find((e) => e.type === "bedtime");
    expect(bedtime).toBeDefined();
    // Trimmed in the cross-day frame so it lands after bedtime.startTime.
    expect(bedtime!.endTime).toBe(6 * 60 + 24 * 60);
    // TIME_EDIT transitions a "recorded" lifecycle to "completed".
    expect(bedtime!.lifecycle.state).toBe("completed");
  });

  it("editWakeTime is a no-op for bedtime trim when no in-progress bedtime exists", async () => {
    const database = db();
    await createDay(database, day({ id: "day-today", wakeTime: 7 * 60 }));
    // No bedtime in events.

    await editWakeTime(database, "child-1", "day-today", 6 * 60);

    const got = await getDay(database, "child-1", "day-today");
    expect(got?.wakeTime).toBe(6 * 60);
    const events = await listEvents(database, "child-1", "day-today");
    expect(events).toEqual([]);
  });

  it("editWakeTime leaves an already-completed bedtime alone", async () => {
    const database = db();
    await createDay(database, day({ id: "day-today", wakeTime: 7 * 60 }));
    const userEnd = 5 * 60 + 30 + 24 * 60;
    await createEvent(
      database,
      "child-1",
      recordedBedtime({
        dayId: "day-today",
        endTime: userEnd,
        lifecycle: { state: "completed", committedAt: userEnd },
      }),
    );

    await editWakeTime(database, "child-1", "day-today", 6 * 60);

    const events = await listEvents(database, "child-1", "day-today");
    const bedtime = events.find((e) => e.type === "bedtime");
    expect(bedtime!.endTime).toBe(userEnd);
    expect(bedtime!.lifecycle.state).toBe("completed");
  });

  // -------------------------------------------------------------------------
  // Write→Watch seam: startNewDay → watchActiveDay. Previously each half
  // had unit tests but the chain was never exercised end-to-end; the
  // wake-gate page bug shipped through the gap.
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
      // Wake-gate bug hinged on wakeTime being delivered: if the converter
      // strips it or the writer omits it, `day.wakeTime === undefined` fires
      // forever after Start Day.
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

  // ---------------------------------------------------------------------------
  // promoteFromPlan
  // ---------------------------------------------------------------------------

  const aPlan = (overrides: Partial<TomorrowPlan> = {}): TomorrowPlan => ({
    childId: "child-1",
    date: "2026-05-21",
    status: "confirmed",
    ownerOverrides: {},
    extras: [],
    ...overrides,
  });

  it("promoteFromPlan creates a Day with wakeTime + templateId + ownerOverrides from the plan", async () => {
    const database = db();
    const plan = aPlan({
      wakeTime: 6 * 60 + 45,
      startTemplateId: "tpl-saturday",
      ownerOverrides: {
        nap_1: { slot: "parent1" },
        bottle_3: null,
      },
    });

    const result = await promoteFromPlan(database, "child-1", plan);
    expect(result.newDayId).toBe("day-child-1-2026-05-21");

    const got = await getDay(database, "child-1", result.newDayId);
    expect(got?.status).toBe("active");
    expect(got?.date).toBe("2026-05-21");
    expect(got?.wakeTime).toBe(6 * 60 + 45);
    expect(got?.templateId).toBe("tpl-saturday");
    expect(got?.ownerOverrides).toEqual({
      nap_1: { slot: "parent1" },
      bottle_3: null,
    });
  });

  // Plan extras get persisted as projected Event docs; dayId is
  // rewritten from the plan-side placeholder to the real newDayId.
  it("promoteFromPlan writes plan.extras as projected Event docs on the new Day", async () => {
    const database = db();
    const extra: Event = {
      id: "extra-pediatrician",
      dayId: "tomorrow-2026-05-21", // plan-side placeholder; should be rewritten
      eventKey: "extra-pediatrician",
      type: "extra",
      kind: "instant",
      startTime: 13 * 60 + 30,
      label: "Pediatrician",
      owner: { slot: "none" },
      hasPutdown: false,
      lifecycle: { state: "projected" },
    };
    const plan = aPlan({
      wakeTime: 7 * 60,
      extras: [extra],
    });

    const result = await promoteFromPlan(database, "child-1", plan);
    const events = await listEvents(database, "child-1", result.newDayId);
    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe("extra-pediatrician");
    expect(events[0]?.dayId).toBe(result.newDayId);
    expect(events[0]?.label).toBe("Pediatrician");
    expect(events[0]?.lifecycle.state).toBe("projected");
  });

  // Inherits startNewDay's archive seam — pre-existing active day
  // flips to archived in the same transaction.
  it("archives any pre-existing active day in the same transaction", async () => {
    const database = db();
    await createDay(database, day({ id: "day-yesterday", date: "2026-05-20", status: "active" }));

    const plan = aPlan({ wakeTime: 7 * 60 });
    const result = await promoteFromPlan(database, "child-1", plan);

    expect(result.archivedDayId).toBe("day-yesterday");
    const yesterday = await getDay(database, "child-1", "day-yesterday");
    expect(yesterday?.status).toBe("archived");
    const today = await getDay(database, "child-1", result.newDayId);
    expect(today?.status).toBe("active");
  });
});
