/**
 * Realistic Firestore document fixtures (typed loosely as Record<string, unknown> — Firestore returns
 * whatever it has; converters/defaulters promise the typed shape).
 *
 * `v3` = fully-shaped happy-path docs; `partial` = docs missing fields added later, exercising
 * defaulter backfill. The `v2`/`mixed` Settings names predate PR-C1 — renaming would ripple tests.
 */

// ---------------------------------------------------------------------------
// Settings fixtures
// ---------------------------------------------------------------------------

export const v2SettingsDoc: Record<string, unknown> = {
  childId: "aden",
  timelineColorMode: "type",
  timelinePxPerHour: 80,
  timelineDimPast: true,
  defaultBottleAmountOz: 5,
  defaultBottleIntervalMinutes: 180,
  defaultNapLengthMinutes: 60,
  putdownLeadMinutes: 15,
  bedtimeThreshold: "19:00", // V2: HH:MM string
  shortNapThresholdMinutes: 35,
  shortNapAdjustmentMinutes: 10,
  wakeWindowsMinutes: [120, 135, 135, 150],
  bottleRules: [
    { minOz: 0, maxOz: 5.5, intervalMinutes: 150 },
    { minOz: 5.6, intervalMinutes: 180 },
  ],
  bottleIntervalRules: [],
  // V2 nested dreamFeed — V3 flattens these
  dreamFeed: {
    enabled: true,
    earliestTime: "20:30",
    latestTime: "21:00",
    minMinutesAfterBedtime: 90,
  },
  pumpTimes: ["10:30", "14:30"], // V2: HH:MM[]
  minBottleIntervalMinutes: 20,
  cookDinner: { enabled: true, time: "17:00" }, // V2 single — V3 generalizes to dailyRecurring[]
};

export const v3SettingsDoc: Record<string, unknown> = {
  childId: "aden",
  defaultWakeTime: 7 * 60, // 420
  bedtimeThreshold: 19 * 60, // 1140
  defaultNapLengthMinutes: 60,
  shortNapThresholdMinutes: 35,
  shortNapAdjustmentMinutes: 10,
  wakeWindowsMinutes: [120, 135, 135, 150, 180, 180],
  napDurationMin: 30,
  napDurationMax: 180,
  defaultBottleAmountOz: 5,
  defaultBottleIntervalMinutes: 180,
  bottleRules: [],
  bottleIntervalRules: [],
  bottleChain: { bottlesPerDay: 5, bufferAfterWakeMinutes: 10 },
  minBottleIntervalMinutes: 90,
  putdownLeadMinutes: 15,
  pumpTimes: [{ time: 10 * 60 + 30 }, { time: 14 * 60 + 30 }], // PumpSession[]
  pumpOwnerSlot: "parent2",
  dreamFeedEnabled: true,
  dailyRecurring: [{ id: "cook-dinner", label: "Cook Dinner", time: 17 * 60, enabled: true }],
  daycare: {
    enabled: false,
    dropoffTime: 8 * 60,
    pickupTime: 17 * 60,
    dropoffOwnerSlot: "parent1",
    pickupOwnerSlot: "parent2",
    weekdays: {
      mon: false,
      tue: false,
      wed: false,
      thu: false,
      fri: false,
      sat: false,
      sun: false,
    },
  },
  owners: {
    parent1: { displayName: "Jake", color: "#0af" },
    parent2: { displayName: "Sam", color: "#f0a" },
    other: [{ id: "daycare", displayName: "Daycare", color: "#ccc" }],
  },
  timelinePxPerHour: 80,
  timelineDimPast: true,
};

/** V3-shape doc missing fields the schema added late (no bottleChain, no owners, no daycare). */
export const partialV3SettingsDoc: Record<string, unknown> = {
  childId: "aden",
  defaultWakeTime: 7 * 60,
  bedtimeThreshold: 19 * 60,
  // bottleChain absent — caused PR #61 crash
  // owners absent — engine crashes when looking up parent1 displayName
  // daycare absent — engine crashes on weekday flag access
  wakeWindowsMinutes: [120, 135],
  putdownLeadMinutes: 15,
};

/** V2-shape doc with V3 settings page partial overlay (mixed shape). */
export const mixedSettingsDoc: Record<string, unknown> = {
  childId: "aden",
  bedtimeThreshold: 19 * 60, // V3 wrote this as number
  pumpTimes: ["10:30"], // V2 string lingering
  dreamFeed: {
    enabled: true,
    earliestTime: "20:30",
    latestTime: "21:00",
    minMinutesAfterBedtime: 90,
  },
  // V3 fields wrote on top:
  bottleChain: { bottlesPerDay: 5, bufferAfterWakeMinutes: 10 },
};

// ---------------------------------------------------------------------------
// Day fixtures
// ---------------------------------------------------------------------------

export const v3DayDoc: Record<string, unknown> = {
  id: "day-2026-05-09",
  childId: "aden",
  date: "2026-05-09",
  status: "active",
  wakeTime: 7 * 60 + 30, // 450
  templateId: "tpl-weekday", // V3 field name
  suppressedRecurringIds: [],
  suppressedDaycareDay: false,
};

/** V3 day missing the suppression arrays (caused engine crash before PR-A0.1). */
export const partialV3DayDoc: Record<string, unknown> = {
  id: "day-2026-05-09",
  childId: "aden",
  date: "2026-05-09",
  status: "active",
  wakeTime: 7 * 60 + 30,
  // suppressedRecurringIds absent
  // suppressedDaycareDay absent
};

// ---------------------------------------------------------------------------
// Event fixtures
// ---------------------------------------------------------------------------

export const v3EventBottleDoc: Record<string, unknown> = {
  id: "bottle-aaaa-bbbb-cccc",
  dayId: "day-2026-05-09",
  eventKey: "bottle_1",
  type: "bottle",
  kind: "instant",
  startTime: 7 * 60 + 30, // 450
  label: "Bottle 1",
  amountOz: 5,
  hasPutdown: false,
  lifecycle: { state: "completed", committedAt: 7 * 60 + 30 },
  owner: { slot: "parent1" },
};

// Post-#166: "in progress" = recorded + now within [startTime, effectiveEnd). Pre-#166 used state "started" + no endTime.
export const v3EventNapStartedDoc: Record<string, unknown> = {
  id: "nap-aaaa-bbbb",
  dayId: "day-2026-05-09",
  eventKey: "nap_1",
  type: "nap",
  kind: "block",
  startTime: 9 * 60, // 540
  endTime: 9 * 60 + 90, // placeholder = startTime + defaultNapLengthMinutes
  label: "Nap 1",
  hasPutdown: false,
  lifecycle: { state: "recorded", annotatedAt: 9 * 60 + 2 },
  owner: { slot: "parent2" },
};

export const v3EventOverriddenDoc: Record<string, unknown> = {
  id: "manual-aaaa-bbbb-cccc-dddd",
  dayId: "day-2026-05-09",
  eventKey: "nap_2",
  type: "nap",
  kind: "block",
  startTime: 13 * 60,
  endTime: 14 * 60 + 30,
  label: "Nap 2",
  hasPutdown: false,
  lifecycle: { state: "recorded", annotatedAt: 13 * 60 },
  owner: { slot: "other", otherId: "daycare" },
};

/** V3 event missing hasPutdown (caused render-side undefined access). */
export const partialV3EventDoc: Record<string, unknown> = {
  id: "evt-zzz",
  dayId: "day-2026-05-09",
  eventKey: "extra_xxx",
  type: "extra",
  kind: "block",
  startTime: 11 * 60,
  endTime: 12 * 60,
  label: "Doctor's appointment",
  // hasPutdown absent
  // lifecycle absent
};

// ---------------------------------------------------------------------------
// Template fixtures
// ---------------------------------------------------------------------------

export const v3TemplateDoc: Record<string, unknown> = {
  id: "tpl-weekday",
  displayName: "Weekday", // V3 field name
  napOwners: [{ slot: "parent1" }, { slot: "parent2" }, { slot: "parent1" }, { slot: "parent2" }],
  wakeWindowOwners: [],
  bedtimeOwner: { slot: "parent1" },
};

// ---------------------------------------------------------------------------
// Combined catalog
// ---------------------------------------------------------------------------

export const fixtures = {
  settings: {
    v2: v2SettingsDoc,
    v3: v3SettingsDoc,
    partialV3: partialV3SettingsDoc,
    mixed: mixedSettingsDoc,
  },
  days: {
    v3: v3DayDoc,
    partialV3: partialV3DayDoc,
  },
  events: {
    v3Bottle: v3EventBottleDoc,
    v3NapStarted: v3EventNapStartedDoc,
    v3Overridden: v3EventOverriddenDoc,
    partialV3: partialV3EventDoc,
  },
  templates: {
    v3: v3TemplateDoc,
  },
};
