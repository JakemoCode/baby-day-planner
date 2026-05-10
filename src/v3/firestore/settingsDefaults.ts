/**
 * V3 Settings defensive defaults.
 *
 * Bridges partial Firestore docs (or V2-shape leftovers from before the
 * cutover) into a fully-shaped V3 Settings, so the engine doesn't crash
 * on `undefined.bottleChain` etc. when a real-world doc is missing
 * fields the V3 schema added.
 *
 * This is a transitional safety net. Once the Settings page is cutover
 * to V3 and writes complete docs, partial docs stop happening; this
 * helper either retires or stays as cheap insurance.
 *
 * Defaults are deliberately conservative: numeric defaults match the
 * engine's expected ranges, daycare is disabled, owners use empty
 * displayNames so the UI prompts the user to set them.
 */

import type { Settings, TimeMin } from "../schemas";

/**
 * Parse "HH:MM" → TimeMin (minutes since midnight). If already a number,
 * pass through. Returns 0 for malformed strings (defensive — engine still
 * runs, value is visibly wrong but not NaN).
 *
 * TODO(PR-C1): Remove this helper and all V2 string→TimeMin coercion
 * below once the V2 cleanup wave wipes string-shaped time fields from
 * Firestore. After cleanup, all callers write TimeMin numbers directly.
 */
function parseTimeStringOrNumber(value: string | number): TimeMin {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return 0;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

const DEFAULTS: Omit<Settings, "childId"> = {
  defaultWakeTime: 7 * 60,
  bedtimeThreshold: 19 * 60,
  defaultNapLengthMinutes: 90,
  shortNapThresholdMinutes: 45,
  shortNapAdjustmentMinutes: 30,
  wakeWindowsMinutes: [120, 150, 180, 180, 180, 180],
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
    parent1: { displayName: "", color: "#0af" },
    parent2: { displayName: "", color: "#f0a" },
    other: [],
  },
  timelinePxPerHour: 80,
  timelineDimPast: true,
};

export function withV3SettingsDefaults(input: Partial<Settings> | null): Settings | null {
  if (input === null) return null;
  const merged: Settings = {
    ...DEFAULTS,
    ...input,
    childId: input.childId ?? "",
    bottleChain: { ...DEFAULTS.bottleChain, ...input.bottleChain },
    daycare: {
      ...DEFAULTS.daycare,
      ...input.daycare,
      weekdays: { ...DEFAULTS.daycare.weekdays, ...input.daycare?.weekdays },
    },
    owners: {
      parent1: { ...DEFAULTS.owners.parent1, ...input.owners?.parent1 },
      parent2: { ...DEFAULTS.owners.parent2, ...input.owners?.parent2 },
      other: input.owners?.other ?? DEFAULTS.owners.other,
    },
  };

  // TODO(PR-C1): Remove the V2 string→TimeMin coercion below once the V2
  // cleanup wave wipes string-shaped time fields from Firestore.
  const rawPumpTimes = (input.pumpTimes ?? merged.pumpTimes) as Array<string | number>;
  merged.pumpTimes = rawPumpTimes.map((v) => parseTimeStringOrNumber(v));
  merged.bedtimeThreshold = parseTimeStringOrNumber(
    merged.bedtimeThreshold as unknown as string | number,
  );
  merged.defaultWakeTime = parseTimeStringOrNumber(
    merged.defaultWakeTime as unknown as string | number,
  );
  merged.dreamFeedStart = parseTimeStringOrNumber(
    merged.dreamFeedStart as unknown as string | number,
  );
  merged.dreamFeedEnd = parseTimeStringOrNumber(merged.dreamFeedEnd as unknown as string | number);
  merged.dailyRecurring = merged.dailyRecurring.map((entry) => ({
    ...entry,
    time: parseTimeStringOrNumber(entry.time as unknown as string | number),
  }));

  return merged;
}
