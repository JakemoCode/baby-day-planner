/**
 * Test factories — small, opinionated helpers for building V3 fixtures.
 *
 * Goal: make tests read like prose. Reach for `aProjectedNap({ start: 13*60 })`
 * before reaching for the full Event literal.
 */

import type {
  Context,
  Day,
  Event,
  EventKind,
  EventType,
  Lifecycle,
  OwnerRef,
  Settings,
  TimeMin,
} from "../schemas";

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter++;
  return `${prefix}_${idCounter}`;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

type EventOverrides = Partial<Event> & {
  start?: TimeMin;
  end?: TimeMin;
};

function eventBase(
  type: EventType,
  kind: EventKind,
  eventKey: string,
  overrides: EventOverrides,
): Event {
  const start = overrides.start ?? overrides.startTime ?? 9 * 60;
  const end = overrides.end ?? overrides.endTime;
  const lifecycle: Lifecycle = overrides.lifecycle ?? { state: "projected" };
  const event: Event = {
    id: overrides.id ?? nextId(type),
    dayId: overrides.dayId ?? "day_test",
    eventKey: overrides.eventKey ?? eventKey,
    type,
    kind,
    startTime: start,
    label: overrides.label ?? eventKey,
    hasPutdown: overrides.hasPutdown ?? false,
    lifecycle,
  };
  if (end !== undefined) event.endTime = end;
  if (overrides.owner !== undefined) event.owner = overrides.owner;
  if (overrides.amountOz !== undefined) event.amountOz = overrides.amountOz;
  return event;
}

export function aProjectedNap(overrides: EventOverrides = {}): Event {
  return eventBase("nap", "block", "nap_1", overrides);
}

export function aRecordedNap(overrides: EventOverrides = {}): Event {
  const committedAt = overrides.start ?? 13 * 60;
  return aProjectedNap({
    ...overrides,
    lifecycle: overrides.lifecycle ?? { state: "completed", committedAt },
  });
}

export function aProjectedBottle(overrides: EventOverrides = {}): Event {
  return eventBase("bottle", "instant", "bottle_1", overrides);
}

export function aRecordedBottle(overrides: EventOverrides = {}): Event {
  const committedAt = overrides.start ?? 9 * 60;
  return aProjectedBottle({
    ...overrides,
    lifecycle: overrides.lifecycle ?? { state: "completed", committedAt },
  });
}

export function aProjectedBedtime(overrides: EventOverrides = {}): Event {
  return eventBase("bedtime", "block", "bedtime", { start: 19 * 60, end: 30 * 60, ...overrides });
}

// ---------------------------------------------------------------------------
// Owners
// ---------------------------------------------------------------------------

export const PARENT1: OwnerRef = { slot: "parent1" };
export const PARENT2: OwnerRef = { slot: "parent2" };
export function otherOwner(id: string): OwnerRef {
  return { slot: "other", otherId: id };
}

// ---------------------------------------------------------------------------
// Day / Settings / Context
// ---------------------------------------------------------------------------

export function aDay(overrides: Partial<Day> = {}): Day {
  return {
    id: overrides.id ?? "day_test",
    childId: overrides.childId ?? "child_test",
    date: overrides.date ?? "2026-05-08",
    status: overrides.status ?? "active",
    suppressedRecurringIds: overrides.suppressedRecurringIds ?? [],
    suppressedDaycareDay: overrides.suppressedDaycareDay ?? false,
    ...(overrides.wakeTime !== undefined ? { wakeTime: overrides.wakeTime } : {}),
    ...(overrides.templateId !== undefined ? { templateId: overrides.templateId } : {}),
  };
}

export function aSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    childId: "child_test",
    defaultWakeTime: 7 * 60,
    bedtimeThreshold: 19 * 60,
    defaultNapLengthMinutes: 60,
    shortNapThresholdMinutes: 35,
    shortNapAdjustmentMinutes: 10,
    wakeWindowsMinutes: [120, 135, 135, 150],
    napDurationMin: 5,
    napDurationMax: 240,
    defaultBottleAmountOz: 5,
    defaultBottleIntervalMinutes: 180,
    bottleRules: [{ minWeeks: 0, amountOz: 5 }],
    bottleChain: { bottlesPerDay: 4 },
    minBottleIntervalMinutes: 20,
    putdownLeadMinutes: 15,
    pumpTimes: [10 * 60 + 30, 14 * 60 + 30],
    pumpOwnerSlot: "parent2",
    dreamFeedEnabled: true,
    dreamFeedStart: 20 * 60 + 30,
    dreamFeedEnd: 21 * 60,
    dreamFeedOffsetAfterBedtimeMinutes: 90,
    dailyRecurring: [],
    daycare: {
      enabled: false,
      dropoffTime: 8 * 60 + 30,
      pickupTime: 17 * 60 + 30,
      ownerId: "daycare",
      weekdays: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
    },
    owners: {
      parent1: { displayName: "Parent 1", color: "--owner-1" },
      parent2: { displayName: "Parent 2", color: "--owner-2" },
      other: [],
    },
    timelinePxPerHour: 120,
    timelineDimPast: true,
    ...overrides,
  };
}

export function aContext(overrides: Partial<Context> = {}): Context {
  return {
    day: overrides.day ?? aDay({ wakeTime: 7 * 60 }),
    settings: overrides.settings ?? aSettings(),
    actuals: overrides.actuals ?? [],
    nowMinutes: overrides.nowMinutes ?? 12 * 60,
    ...(overrides.template !== undefined ? { template: overrides.template } : {}),
  };
}
