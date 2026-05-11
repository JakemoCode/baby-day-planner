import type { Day, Settings } from "@/v3/schemas";

// TODO(post-cutover): make useV3Projection handle null day/settings
// internally so placeholders aren't needed.

/**
 * Placeholder Day used while the real day is loading. The timeline page
 * early-returns before rendering engine output derived from this value;
 * the placeholder exists only to keep `useV3Projection`'s hook order
 * stable across renders.
 *
 * `wakeTime` is omitted: under `exactOptionalPropertyTypes: true` the
 * `Day.wakeTime?: TimeMin` declaration disallows an explicit
 * `undefined` value, so absence is the only way to express "not set."
 */
export const PLACEHOLDER_DAY: Day = {
  id: "",
  childId: "",
  date: "",
  status: "active",
  suppressedRecurringIds: [],
  suppressedDaycareDay: false,
};

/**
 * Placeholder Settings used while the real settings are loading. See
 * PLACEHOLDER_DAY for rationale.
 */
export const PLACEHOLDER_SETTINGS: Settings = {
  childId: "",
  defaultWakeTime: 7 * 60,
  bedtimeThreshold: 19 * 60,
  defaultNapLengthMinutes: 90,
  shortNapThresholdMinutes: 45,
  shortNapAdjustmentMinutes: 30,
  wakeWindowsMinutes: [],
  napDurationMin: 30,
  napDurationMax: 180,
  defaultBottleAmountOz: 5,
  defaultBottleIntervalMinutes: 180,
  bottleRules: [],
  bottleChain: { bottlesPerDay: 5, bufferAfterWakeMinutes: 10 },
  minBottleIntervalMinutes: 90,
  putdownLeadMinutes: 15,
  pumpTimes: [],
  pumpOwnerSlot: "parent2",
  dreamFeedEnabled: false,
  dreamFeedStart: 22 * 60,
  dreamFeedEnd: 23 * 60,
  dreamFeedOffsetAfterBedtimeMinutes: 180,
  dailyRecurring: [],
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
    parent1: { displayName: "", color: "#7a8fa8" },
    parent2: { displayName: "", color: "#ce8e7e" },
    other: [],
  },
  timelinePxPerHour: 80,
  timelineDimPast: true,
};
