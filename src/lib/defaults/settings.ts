/**
 * Production defaults used when no Settings doc exists yet (first run for a
 * child). The Settings page renders editors against these values; the user's
 * first edit creates the Firestore doc.
 *
 * Tuned for an early infant: 4 naps, 5 oz bottles, 7 PM bedtime, dream feed.
 * Customise from /settings — these are just a starting place.
 */

import type { Settings } from "@/domain";

export function defaultSettings(childId: string): Settings {
  return {
    childId,
    defaultBottleAmountOz: 5,
    defaultBottleIntervalMinutes: 180,
    defaultNapLengthMinutes: 60,
    putdownLeadMinutes: 15,
    bedtimeThreshold: "19:00",
    shortNapThresholdMinutes: 35,
    shortNapAdjustmentMinutes: 10,
    wakeWindowsMinutes: [120, 135, 135, 150],
    bottleRules: [
      { minOz: 0, maxOz: 5.5, intervalMinutes: 150 },
      { minOz: 5.6, intervalMinutes: 180 },
    ],
    dreamFeed: {
      enabled: true,
      earliestTime: "20:30",
      latestTime: "21:00",
      minMinutesAfterBedtime: 90,
    },
    pumpTimes: ["10:30", "14:30"],
  };
}
