/**
 * Property-test arbitraries for the V3 engine.
 * Each generator produces a valid shape; invalid combinations are filtered via fc.pre() at the property site.
 */

import fc from "fast-check";
import type { Day, Event, Lifecycle, OwnerRef, ProjectInput, Settings, TimeMin } from "../schemas";
import { NO_OWNER } from "../schemas";
import { aDay, aSettings } from "./factories";

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** Minutes since midnight, allowing cross-day (0..2880). */
export const arbTimeMin: fc.Arbitrary<TimeMin> = fc.integer({
  min: 0,
  max: 48 * 60,
});

/** Same-day start time (5am to 11pm) so test scenarios stay realistic. */
export const arbDayTime: fc.Arbitrary<TimeMin> = fc.integer({
  min: 5 * 60,
  max: 23 * 60,
});

// ---------------------------------------------------------------------------
// Owners
// ---------------------------------------------------------------------------

export const arbOwnerRef: fc.Arbitrary<OwnerRef> = fc.oneof(
  fc.constant({ slot: "parent1" } as const),
  fc.constant({ slot: "parent2" } as const),
  fc.string({ minLength: 1, maxLength: 8 }).map((id) => ({ slot: "other" as const, otherId: id })),
);

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export const arbProjectedLifecycle: fc.Arbitrary<Lifecycle> = fc.constant({
  state: "projected",
});

export const arbCompletedLifecycle: fc.Arbitrary<Lifecycle> = arbDayTime.map(
  (committedAt) => ({ state: "completed", committedAt }) satisfies Lifecycle,
);

export const arbRecordedLifecycle: fc.Arbitrary<Lifecycle> = arbDayTime.map(
  (annotatedAt) => ({ state: "recorded", annotatedAt }) satisfies Lifecycle,
);

export const arbAnyLifecycle: fc.Arbitrary<Lifecycle> = fc.oneof(
  arbProjectedLifecycle,
  arbRecordedLifecycle,
  arbCompletedLifecycle,
);

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

let idCounter = 0;
const nextId = (): string => {
  idCounter++;
  return `evt_${idCounter}`;
};

/** Recorded nap targeting nap_1..nap_4 slots so cascade-anchoring scenarios exercise R3.3/R3.5/R3.6. */
export const arbRecordedNap: fc.Arbitrary<Event> = fc
  .record({
    slot: fc.integer({ min: 1, max: 4 }),
    start: fc.integer({ min: 6 * 60, max: 18 * 60 }),
    durationMinutes: fc.integer({ min: 10, max: 180 }),
  })
  .map(({ slot, start, durationMinutes }) => {
    const event: Event = {
      id: nextId(),
      dayId: "day_test",
      eventKey: `nap_${slot}`,
      type: "nap",
      kind: "block",
      startTime: start,
      endTime: start + durationMinutes,
      label: `Nap ${slot}`,
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "completed", committedAt: start },
    };
    return event;
  });

export const arbRecordedBottle: fc.Arbitrary<Event> = arbDayTime.map((start) => ({
  id: nextId(),
  dayId: "day_test",
  eventKey: `bottle_recorded_${start}`,
  type: "bottle",
  kind: "instant",
  startTime: start,
  label: "Bottle",
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "completed", committedAt: start },
  amountOz: 5,
}));

/** A list of recorded actuals — small (0..6) so property runs stay quick. */
export const arbActuals: fc.Arbitrary<Event[]> = fc.array(
  fc.oneof(arbRecordedNap, arbRecordedBottle),
  { minLength: 0, maxLength: 6 },
);

// ---------------------------------------------------------------------------
// Day / Settings / ProjectInput
// ---------------------------------------------------------------------------

export const arbDay: fc.Arbitrary<Day> = arbDayTime.map((wakeTime) => aDay({ wakeTime }));

/** Settings spanning realistic ranges so the cascade produces sensible cadence shapes. */
export const arbSettings: fc.Arbitrary<Settings> = fc
  .record({
    bottlesPerDay: fc.integer({ min: 2, max: 8 }),
    bedtimeThresholdHour: fc.integer({ min: 18, max: 21 }),
    bottleIntervalMinutes: fc.constantFrom(150, 180, 210),
  })
  .map(({ bottlesPerDay, bedtimeThresholdHour, bottleIntervalMinutes }) =>
    aSettings({
      bottleChain: { bottlesPerDay, bufferAfterWakeMinutes: 10 },
      bedtimeThreshold: bedtimeThresholdHour * 60,
      defaultBottleIntervalMinutes: bottleIntervalMinutes,
    }),
  );

export const arbProjectInput: fc.Arbitrary<ProjectInput> = fc
  .record({
    day: arbDay,
    settings: arbSettings,
    actuals: arbActuals,
    nowMinutes: arbDayTime,
  })
  .map((rec) => rec satisfies ProjectInput);
