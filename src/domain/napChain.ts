import type { Day, Event, Settings } from "./types";
import { makeEvent } from "./types";
import { addMinutes } from "./time";

export function projectNapChain(day: Day, settings: Settings): Event[] {
  if (!day.wakeTime) return [];
  const out: Event[] = [];

  out.push(
    makeEvent({
      id: `proj-${day.id}-wake`,
      dayId: day.id,
      eventKey: "wake",
      type: "wake",
      label: "Wake",
      startTime: day.wakeTime,
      source: "projected",
      status: "projected",
    }),
  );

  let cursor = day.wakeTime;
  settings.wakeWindowsMinutes.forEach((wwMins, i) => {
    const wwEnd = addMinutes(cursor, wwMins);
    out.push(
      makeEvent({
        id: `proj-${day.id}-ww-${i + 1}`,
        dayId: day.id,
        eventKey: `wake_window_${i + 1}`,
        type: "wake_window",
        label: `Wake Window ${i + 1}`,
        startTime: cursor,
        endTime: wwEnd,
        source: "projected",
        status: "projected",
      }),
    );

    const napStart = wwEnd;
    const napEnd = addMinutes(napStart, settings.defaultNapLengthMinutes);
    out.push(
      makeEvent({
        id: `proj-${day.id}-nap-${i + 1}`,
        dayId: day.id,
        eventKey: `nap_${i + 1}`,
        type: "nap",
        label: `Nap ${i + 1}`,
        startTime: napStart,
        endTime: napEnd,
        source: "projected",
        status: "projected",
      }),
    );

    cursor = napEnd;
  });

  return out;
}
