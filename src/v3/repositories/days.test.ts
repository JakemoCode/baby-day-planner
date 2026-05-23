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
  editWakeTime,
  getDay,
  getDayByDate,
  listArchivedDays,
  promoteFromPlan,
  startNewDay,
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

  // §F12 PR 1 — slice 2: Day carries optional per-event ownerOverrides
  // that the engine consumes to color projected events with the user's
  // planned assignments. `null` means explicit NO_OWNER (user
  // unassigned a slot that would otherwise default to an owner).
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

  // §F63 — owner-only edits on projected events route through this fn
  // to Day.ownerOverrides (not the events collection), preserving the
  // engine's freedom to re-project the event's time.
  it("updateDayOwnerOverride merges into existing ownerOverrides map (does not replace)", async () => {
    const database = db();
    await createDay(
      database,
      day({ ownerOverrides: { nap_1: { slot: "parent1" } } }),
    );
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
    await createDay(
      database,
      day({ ownerOverrides: { nap_1: { slot: "parent1" } } }),
    );
    await updateDayOwnerOverride(database, "child-1", "day-1", "nap_1", {
      slot: "parent2",
    });
    const got = await getDay(database, "child-1", "day-1");
    expect(got?.ownerOverrides).toEqual({ nap_1: { slot: "parent2" } });
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

  // §F17 PR 1 — slice 5: callers can omit newDayId and startNewDay
  // derives a deterministic `day-${childId}-${date}` id. This makes
  // concurrent rollover safe (both clients write to the same doc id
  // via idempotent setDoc) and removes a useless caller responsibility.
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

  // §F17 PR 1 — slice 6: deterministic id makes startNewDay idempotent
  // under concurrent rollover. Two clients calling startNewDay for the
  // same (childId, date) write to the same doc id; second call is a
  // no-op overwrite. No duplicate active docs created.
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
  // editWakeTime — the /timeline EditableWakeTime affordance must also
  // close any in-progress overnight bedtime in TODAY's events, otherwise
  // the dashboard renders "Bedtime in progress — 0m" forever even
  // though the user clearly woke up by setting today's wakeTime.
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

  // ---------------------------------------------------------------------------
  // promoteFromPlan (§F17 PR 1 — slices 7, 8, 9)
  // ---------------------------------------------------------------------------

  const aPlan = (overrides: Partial<TomorrowPlan> = {}): TomorrowPlan => ({
    childId: "child-1",
    date: "2026-05-21",
    status: "confirmed",
    ownerOverrides: {},
    extras: [],
    ...overrides,
  });

  // §F17 PR 1 — slice 7: promoteFromPlan creates the new Day with the
  // plan's wakeTime, templateId, and ownerOverrides. Uses the
  // deterministic id so it composes with the auto-rollover hook's
  // concurrent-safety story.
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

  // §F17 PR 1 — slice 8: extras on the plan get persisted as projected
  // Event docs against the newly-created Day. Their dayId must be
  // rewritten from the placeholder ("tomorrow-…") on the plan to the
  // real newDayId.
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

  // §F17 PR 1 — slice 9: promoteFromPlan inherits startNewDay's
  // archive seam. Any pre-existing active day flips to archived in
  // the same transaction that creates the new one.
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
