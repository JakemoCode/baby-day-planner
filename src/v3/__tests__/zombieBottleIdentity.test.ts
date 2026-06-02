/**
 * §F66 / ADR-0007 — the "zombie bottle" regression seam.
 *
 * Root cause: auto-promoted bottles were persisted under `recorded_<eventKey>`,
 * but `eventKey` (`bottle_N`) renumbers (R5.4) and diverges across unsynced
 * clients. A re-persist after a renumber minted a SECOND doc → a no-owner
 * duplicate at the original forecast time that reset couldn't kill.
 *
 * These tests exercise the REAL engine (projectDay) + the REAL id convention —
 * no engine mocks. The fix is the doc id: bottles key off startTime, which is
 * renumber-independent and client-deterministic.
 */

import { describe, expect, it } from "vitest";
import { projectDay } from "../engine/projectDay";
import { recordedIdForEvent } from "../lib/eventConventions";
import { aDay, aRecordedBottle, aSettings } from "./factories";
import type { Event } from "../schemas";

const settings = aSettings({
  bottleChain: { bufferAfterWakeMinutes: 10 },
  defaultBottleIntervalMinutes: 180,
  wakeWindowsMinutes: [], // isolate the bottle chain
  bedtimeThreshold: 23 * 60,
});

const bottlesAt = (events: Event[], startTime: number) =>
  events.filter((e) => e.type === "bottle" && e.startTime === startTime);

const MORNING = 7 * 60 + 10; // wakeTime 7:00 + buffer 10

/** Auto-promote the same morning feed on a client whose recorded set is `recorded`. */
function promoteMorningFeed(recorded: Event[]): Event {
  const out = projectDay({
    day: aDay({ wakeTime: 7 * 60 }),
    settings,
    actuals: recorded,
    nowMinutes: 12 * 60,
  });
  const morning = out.find((e) => e.type === "bottle" && e.startTime === MORNING);
  expect(morning, "morning feed should be present and auto-promoted").toBeDefined();
  expect(morning!.lifecycle.state).toBe("recorded");
  return morning!;
}

describe("zombie bottle — deterministic doc id (§F66 / ADR-0007)", () => {
  // The bug: the auto-promoted bottle's eventKey is `bottle_{maxRecorded+k}`,
  // captured while still projected. maxRecorded diverges across unsynced clients,
  // so the old `recorded_<eventKey>` id minted two docs for one physical feed.
  it("two clients with divergent recorded sets converge to ONE doc id for the same feed", () => {
    // Client A: no other bottles recorded yet → morning feed slots as bottle_1.
    const clientA = promoteMorningFeed([]);

    // Client B (wife's tab): two afternoon bottles already recorded → the SAME
    // morning feed slots after them, as bottle_3.
    const afternoon = [
      aRecordedBottle({
        id: "recorded_bottle_t780",
        eventKey: "bottle_1",
        start: 13 * 60,
        lifecycle: { state: "recorded", annotatedAt: 13 * 60 },
      }),
      aRecordedBottle({
        id: "recorded_bottle_t960",
        eventKey: "bottle_2",
        start: 16 * 60,
        lifecycle: { state: "recorded", annotatedAt: 16 * 60 },
      }),
    ];
    const clientB = promoteMorningFeed(afternoon);

    // The real engine genuinely assigns divergent eventKeys (this is the bug's source).
    expect(clientA.eventKey).not.toBe(clientB.eventKey);

    // ...yet both clients persist under the SAME startTime-keyed doc id → one doc.
    expect(recordedIdForEvent(clientA)).toBe(recordedIdForEvent(clientB));
    expect(recordedIdForEvent(clientA)).toBe(`recorded_bottle_t${MORNING}`);
  });

  it("persisting the promoted feed leaves exactly one bottle at that time on reproject", () => {
    const promoted = promoteMorningFeed([]);
    const persisted: Event = { ...promoted, id: recordedIdForEvent(promoted) };

    const out = projectDay({
      day: aDay({ wakeTime: 7 * 60 }),
      settings,
      actuals: [persisted],
      nowMinutes: 12 * 60,
    });

    expect(bottlesAt(out, MORNING)).toHaveLength(1);
    expect(out.find((e) => e.startTime === MORNING)!.id).toBe(persisted.id);
  });
});
