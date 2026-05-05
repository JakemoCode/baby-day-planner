import type { Event, Settings } from "./types";
import { parseTime } from "./time";

export function applyBedtime(events: Event[], settings: Settings): Event[] {
  const bedtimeMins = parseTime(settings.bedtimeThreshold);
  const naps = events.filter((e) => e.type === "nap");
  const replaceIdx = naps.findIndex((n) => parseTime(n.startTime) >= bedtimeMins);
  if (replaceIdx === -1) return events;

  const napToReplace = naps[replaceIdx]!;
  const out = events
    .filter((e) => {
      if (e.id === napToReplace.id) return false;
      if (e.type === "nap" && parseTime(e.startTime) >= bedtimeMins) return false;
      if (e.type === "wake_window" && parseTime(e.startTime) >= parseTime(napToReplace.startTime)) {
        return false;
      }
      return true;
    })
    .concat([
      {
        id: `proj-${napToReplace.dayId}-bedtime`,
        dayId: napToReplace.dayId,
        eventKey: "bedtime",
        type: "bedtime",
        label: "Bedtime",
        startTime: napToReplace.startTime,
        source: "projected",
        status: "projected",
      },
    ]);

  return out.sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));
}
