import type { Event } from "./types";
import { parseTime } from "./time";

export function nextEvent(events: Event[], nowMinutes: number): Event | undefined {
  return events
    .filter((e) => e.type !== "wake_window" && parseTime(e.startTime) > nowMinutes)
    .sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime))[0];
}

export function nextBottle(events: Event[], nowMinutes: number): Event | undefined {
  return events
    .filter((e) => e.type === "bottle" && parseTime(e.startTime) >= nowMinutes)
    .sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime))[0];
}

export function nextNap(events: Event[], nowMinutes: number): Event | undefined {
  return events
    .filter((e) => e.type === "nap" && parseTime(e.startTime) >= nowMinutes)
    .sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime))[0];
}

export function currentWakeWindow(events: Event[], nowMinutes: number): Event | undefined {
  return events.find(
    (e) =>
      e.type === "wake_window" &&
      e.endTime !== undefined &&
      parseTime(e.startTime) <= nowMinutes &&
      nowMinutes < parseTime(e.endTime),
  );
}

export function projectedBedtime(events: Event[]): string | undefined {
  return events.find((e) => e.type === "bedtime")?.startTime;
}
