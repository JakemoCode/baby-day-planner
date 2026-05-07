import type { Event, Settings } from "./types";
import { parseTime } from "./time";

export function applyBedtime(events: Event[], settings: Settings, actuals: Event[] = []): Event[] {
  // Honor a user-supplied (manual / actual) bedtime first — it represents an
  // explicit override of the projected schedule. Trim naps and wake windows
  // that fall at/after the override time and use that bedtime as canonical.
  const userBedtime = actuals.find(
    (e) => e.type === "bedtime" && (e.source === "manual" || e.source === "actual"),
  );
  if (userBedtime) {
    const bedMins = parseTime(userBedtime.startTime);
    const trimmed = events.flatMap((e): Event[] => {
      if (e.type === "bedtime") return []; // drop any projected bedtime
      if (e.type === "nap") {
        if (parseTime(e.startTime) >= bedMins) return [];
        // Nap crosses bedtime — drop it. Bedtime overrides the projected nap;
        // a 5-min sliver of nap before sleep isn't useful to surface.
        if (e.endTime && parseTime(e.endTime) > bedMins) return [];
      }
      if (e.type === "wake_window") {
        if (parseTime(e.startTime) >= bedMins) return [];
        if (e.endTime && parseTime(e.endTime) > bedMins) {
          return [{ ...e, endTime: userBedtime.startTime }];
        }
      }
      return [e];
    });
    return [...trimmed, userBedtime].sort(
      (a, b) => parseTime(a.startTime) - parseTime(b.startTime),
    );
  }

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
