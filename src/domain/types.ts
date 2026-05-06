export type Owner = "Jake" | "Kelly" | "Daycare";

export type EventType =
  | "wake"
  | "wake_window"
  | "putdown"
  | "nap"
  | "bottle"
  | "pump"
  | "bedtime"
  | "dream_feed"
  | "extra";

export type EventSource = "actual" | "projected" | "manual" | "template";
export type EventStatus = "projected" | "actual" | "overridden" | "completed";

export type Event = {
  id: string;
  dayId: string;
  eventKey: string;
  type: EventType;
  label: string;
  startTime: string; // "HH:MM" or "HH:MM" with hours 24+ for cross-midnight
  endTime?: string;
  owner?: Owner;
  amountOz?: number;
  source: EventSource;
  status: EventStatus;
};

export type BottleRule = {
  minOz: number;
  maxOz?: number; // open-ended if undefined
  intervalMinutes: number;
};

export type DreamFeedSettings = {
  enabled: boolean;
  earliestTime: string; // "HH:MM"
  latestTime: string; // "HH:MM" (cap, max 21:00 per PRD)
  minMinutesAfterBedtime: number; // default 90
};

export type Settings = {
  childId: string;
  defaultBottleAmountOz: number;
  defaultBottleIntervalMinutes: number; // fallback when no rule matches
  defaultNapLengthMinutes: number;
  putdownLeadMinutes: number;
  bedtimeThreshold: string; // "HH:MM"
  shortNapThresholdMinutes: number;
  shortNapAdjustmentMinutes: number;
  wakeWindowsMinutes: number[];
  bottleRules: BottleRule[];
  dreamFeed: DreamFeedSettings;
  pumpTimes: string[]; // "HH:MM"[]
  /**
   * "Are you sure?" guard: if Start Bottle Now is tapped within this many
   * minutes of the most recent bottle, the UI shows a confirm dialog before
   * recording the new event. Optional to keep older Settings docs valid;
   * UI falls back to 20 when missing.
   */
  minBottleIntervalMinutes?: number;
};

export type Day = {
  id: string;
  childId: string;
  date: string; // "YYYY-MM-DD"
  status: "planned" | "active" | "archived";
  wakeTime?: string; // "HH:MM"
  ownershipTemplateId?: string;
  createdAt: string;
  archivedAt?: string;
};

export type OwnershipTemplate = {
  id: string;
  label: string; // e.g. "Saturday"
  napOwners: Owner[]; // index = nap N - 1
  wakeWindowOwners: Owner[]; // index = ww N - 1
  bottleOwners?: Owner[]; // index = bottle N - 1; optional for back-compat
};

export type ProjectInput = {
  day: Day;
  settings: Settings;
  actuals: Event[]; // events with source: "actual" | "manual"
  template?: OwnershipTemplate;
  nowMinutes?: number; // for "now" comparisons in overlap rule; default = end of day
};
