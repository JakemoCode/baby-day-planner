import type { Day, Event, Settings } from "./types";
import { makeEvent } from "./types";
import { addMinutes, formatTime, parseTime } from "./time";

/**
 * Emits a dream-feed event for the day. If a manual / actual dream_feed
 * exists in `actuals`, use it (so the user's edited time + owner stick).
 * Otherwise project from settings against bedtime.
 */
export function addDreamFeed(
  events: Event[],
  settings: Settings,
  day: Day,
  actuals: Event[] = [],
): Event[] {
  // User override always wins — pick it up here so the engine doesn't
  // silently re-emit a projected version with no owner.
  const userDreamFeed = actuals.find(
    (e) => e.type === "dream_feed" && (e.source === "manual" || e.source === "actual"),
  );
  if (userDreamFeed) {
    return [...events, userDreamFeed].sort(
      (a, b) => parseTime(a.startTime) - parseTime(b.startTime),
    );
  }

  const cfg = settings.dreamFeed;
  if (!cfg.enabled) return events;
  const bedtime = events.find((e) => e.type === "bedtime");
  if (!bedtime) return events;

  const earliestAllowed = addMinutes(bedtime.startTime, cfg.minMinutesAfterBedtime);
  const earliest =
    parseTime(earliestAllowed) > parseTime(cfg.earliestTime) ? earliestAllowed : cfg.earliestTime;
  const finalStart = parseTime(earliest) > parseTime(cfg.latestTime) ? cfg.latestTime : earliest;

  const dreamFeed: Event = makeEvent({
    id: `proj-${day.id}-dream-feed`,
    dayId: day.id,
    eventKey: "dream_feed",
    type: "dream_feed",
    label: "Dream Feed",
    startTime: formatTime(parseTime(finalStart)),
    source: "projected",
    status: "projected",
  });
  return [...events, dreamFeed].sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));
}
