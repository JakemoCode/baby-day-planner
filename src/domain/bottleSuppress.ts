import type { Event, Settings } from "./types";
import { parseTime } from "./time";

export function suppressBottlesAfterBedtime(events: Event[], settings: Settings): Event[] {
  const cutoff = parseTime(settings.bedtimeThreshold);
  return events.filter((e) => {
    if (e.type !== "bottle") return true;
    if (e.source !== "projected") return true;
    return parseTime(e.startTime) < cutoff;
  });
}
