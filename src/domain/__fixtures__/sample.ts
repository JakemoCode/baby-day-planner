import type { Day, Settings, OwnershipTemplate } from "../types";

export const sampleSettings: Settings = {
  childId: "child-1",
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

export const sampleDay: Day = {
  id: "day-1",
  childId: "child-1",
  date: "2026-05-04",
  status: "active",
  wakeTime: "07:00",
  createdAt: "2026-05-04T07:00:00Z",
};

export const saturdayTemplate: OwnershipTemplate = {
  id: "tmpl-saturday",
  label: "Saturday",
  napOwners: ["Kelly", "Jake", "Kelly", "Jake"],
  wakeWindowOwners: ["Jake", "Kelly", "Jake", "Kelly"],
};
