import type { Day, Event, Settings } from "./types";
import { addMinutes, formatTime, parseTime } from "./time";

export function addDreamFeed(events: Event[], settings: Settings, day: Day): Event[] {
  const cfg = settings.dreamFeed;
  if (!cfg.enabled) return events;
  const bedtime = events.find((e) => e.type === "bedtime");
  if (!bedtime) return events;

  const earliestAllowed = addMinutes(bedtime.startTime, cfg.minMinutesAfterBedtime);
  const earliest =
    parseTime(earliestAllowed) > parseTime(cfg.earliestTime) ? earliestAllowed : cfg.earliestTime;
  const finalStart = parseTime(earliest) > parseTime(cfg.latestTime) ? cfg.latestTime : earliest;

  const dreamFeed: Event = {
    id: `proj-${day.id}-dream-feed`,
    dayId: day.id,
    eventKey: "dream_feed",
    type: "dream_feed",
    label: "Dream Feed",
    startTime: formatTime(parseTime(finalStart)),
    source: "projected",
    status: "projected",
  };
  return [...events, dreamFeed].sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));
}
