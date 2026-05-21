/**
 * Test factories — small, opinionated helpers for building V3 fixtures.
 *
 * Goal: make tests read like prose. Reach for `aProjectedNap({ start: 13*60 })`
 * before reaching for the full Event literal.
 */

import {
  NO_OWNER,
  type Context,
  type Day,
  type Event,
  type EventKind,
  type EventType,
  type Lifecycle,
  type OwnerRef,
  type OwnershipTemplate,
  type Settings,
  type TimeMin,
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
    owner: overrides.owner ?? NO_OWNER, // §F37: owner is required; default to unassigned
    lifecycle,
  };
  if (end !== undefined) event.endTime = end;
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

export function aRecordedBedtime(overrides: EventOverrides = {}): Event {
  const start = overrides.start ?? overrides.startTime ?? 19 * 60;
  return aProjectedBedtime({
    ...overrides,
    lifecycle: overrides.lifecycle ?? { state: "completed", committedAt: start },
  });
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
// Templates
// ---------------------------------------------------------------------------

export function aTemplate(overrides: Partial<OwnershipTemplate> = {}): OwnershipTemplate {
  return {
    id: overrides.id ?? "tpl_test",
    displayName: overrides.displayName ?? "Test template",
    napOwners: overrides.napOwners ?? [],
    wakeWindowOwners: overrides.wakeWindowOwners ?? [],
    ...(overrides.bottleOwners !== undefined ? { bottleOwners: overrides.bottleOwners } : {}),
    ...(overrides.bedtimeOwner !== undefined ? { bedtimeOwner: overrides.bedtimeOwner } : {}),
  };
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
    ...(overrides.ownerOverrides !== undefined ? { ownerOverrides: overrides.ownerOverrides } : {}),
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
    bottleIntervalRules: [],
    bottleChain: { bottlesPerDay: 4, bufferAfterWakeMinutes: 10 },
    minBottleIntervalMinutes: 20,
    putdownLeadMinutes: 15,
    pumpTimes: [{ time: 10 * 60 + 30 }, { time: 14 * 60 + 30 }],
    pumpOwnerSlot: "parent2",
    defaultPumpDurationMinutes: 25,
    dreamFeedEnabled: true,
    dailyRecurring: [],
    daycare: {
      enabled: false,
      dropoffTime: 8 * 60 + 30,
      pickupTime: 17 * 60 + 30,
      dropoffOwnerSlot: "parent1",
      pickupOwnerSlot: "parent2",
      weekdays: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
    },
    owners: {
      parent1: { displayName: "Parent 1", color: "--owner-1" },
      parent2: { displayName: "Parent 2", color: "--owner-2" },
      other: [],
    },
    timelineColorMode: "type",
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
