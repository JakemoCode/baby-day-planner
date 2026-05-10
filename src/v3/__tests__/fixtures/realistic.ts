/**
 * Realistic Firestore document fixtures spanning the V2 → V3 cutover.
 *
 * Three shape categories cover what real production data looks like
 * during and after the cutover:
 *
 *   v2: pre-cutover writes (V2 settings page, V2 dashboard, V2 drawer)
 *   v3: post-cutover writes (V3 settings page, V3 timeline drawer)
 *   partial: V3-shape doc missing fields the schema added later, OR
 *            V2 doc missing fields V2 itself added late
 *
 * These fixtures are typed loosely (Record<string, unknown>) because
 * Firestore returns whatever it has — the converters and defaulters
 * are the layer that promises a typed shape. Tests that assert against
 * the fixtures expose the real-world failure modes of the defaulters.
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
  bottleChain: { bottlesPerDay: 5, bufferAfterWakeMinutes: 10 },
  minBottleIntervalMinutes: 90,
  putdownLeadMinutes: 15,
  pumpTimes: [10 * 60 + 30, 14 * 60 + 30], // [630, 870]
  pumpOwnerSlot: "parent2",
  dreamFeedEnabled: true,
  dreamFeedStart: 20 * 60 + 30, // 1230
  dreamFeedEnd: 21 * 60, // 1260
  dreamFeedOffsetAfterBedtimeMinutes: 90,
  dailyRecurring: [{ id: "cook-dinner", label: "Cook Dinner", time: 17 * 60, enabled: true }],
  daycare: {
    enabled: false,
    dropoffTime: 8 * 60,
    pickupTime: 17 * 60,
    ownerId: "",
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

export const v2DayDoc: Record<string, unknown> = {
  id: "day-2026-05-09",
  childId: "aden",
  date: "2026-05-09",
  status: "active",
  wakeTime: "07:30", // V2: HH:MM string
  ownershipTemplateId: "tpl-weekday", // V2 field name
  createdAt: "2026-05-09T07:30:00Z",
};

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

export const v2EventBottleDoc: Record<string, unknown> = {
  id: "bottle-1",
  dayId: "day-2026-05-09",
  eventKey: "bottle_1",
  type: "bottle",
  kind: "instant",
  label: "Bottle 1",
  startTime: "07:30",
  amountOz: 5,
  source: "actual",
  status: "completed",
  recorded: true,
  owner: "Jake", // V2 free string
};

export const v2EventNapInProgressDoc: Record<string, unknown> = {
  id: "nap-1",
  dayId: "day-2026-05-09",
  eventKey: "nap_1",
  type: "nap",
  kind: "block",
  label: "Nap 1",
  startTime: "09:00",
  // no endTime — in progress
  source: "actual",
  status: "active",
  recorded: true,
  owner: "Kelly",
};

export const v2EventOverriddenDoc: Record<string, unknown> = {
  id: "manual-1715000000000",
  dayId: "day-2026-05-09",
  eventKey: "nap_2",
  type: "nap",
  kind: "block",
  label: "Nap 2",
  startTime: "13:00",
  endTime: "14:30",
  source: "manual",
  status: "overridden",
  recorded: false,
  owner: "Daycare",
};

export const v2EventNoOwnerDoc: Record<string, unknown> = {
  id: "pump-1",
  dayId: "day-2026-05-09",
  eventKey: "pump_10:30",
  type: "pump",
  kind: "instant",
  label: "Pump",
  startTime: "10:30",
  source: "manual",
  status: "completed",
  recorded: true,
  // no owner — V2 omits when unknown
};

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

export const v3EventNapStartedDoc: Record<string, unknown> = {
  id: "nap-aaaa-bbbb",
  dayId: "day-2026-05-09",
  eventKey: "nap_1",
  type: "nap",
  kind: "block",
  startTime: 9 * 60, // 540
  // no endTime — started
  label: "Nap 1",
  hasPutdown: false,
  lifecycle: { state: "started", committedAt: 9 * 60 + 2 },
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
  lifecycle: { state: "overridden", annotatedAt: 13 * 60 },
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

export const v2TemplateDoc: Record<string, unknown> = {
  id: "tpl-weekday",
  label: "Weekday", // V2 field name
  napOwners: ["Jake", "Kelly", "Jake", "Kelly"], // V2 strings
  wakeWindowOwners: [],
  bedtimeOwner: "Jake",
};

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
    v2: v2DayDoc,
    v3: v3DayDoc,
    partialV3: partialV3DayDoc,
  },
  events: {
    v2Bottle: v2EventBottleDoc,
    v2NapInProgress: v2EventNapInProgressDoc,
    v2Overridden: v2EventOverriddenDoc,
    v2NoOwner: v2EventNoOwnerDoc,
    v3Bottle: v3EventBottleDoc,
    v3NapStarted: v3EventNapStartedDoc,
    v3Overridden: v3EventOverriddenDoc,
    partialV3: partialV3EventDoc,
  },
  templates: {
    v2: v2TemplateDoc,
    v3: v3TemplateDoc,
  },
};
