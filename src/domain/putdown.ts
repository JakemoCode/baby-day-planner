import type { Event, Settings } from "./types";
import { makeEvent } from "./types";
import { addMinutes, parseTime } from "./time";

// Escape hatch: any event type returning a number gets a putdown emitted at that lead time.
// Today nap and bedtime share a lead time. If they ever diverge, branch here — don't
// scatter conditionals through the rest of the engine.
function putdownLeadFor(event: Event, settings: Settings): number | undefined {
  if (event.type === "nap") return settings.putdownLeadMinutes;
  if (event.type === "bedtime") return settings.putdownLeadMinutes;
  return undefined;
}

export function addPutdownEvents(events: Event[], settings: Settings): Event[] {
  const additions: Event[] = [];
  for (const e of events) {
    if (e.source !== "projected") continue;
    const lead = putdownLeadFor(e, settings);
    if (lead === undefined) continue;
    additions.push(
      makeEvent({
        id: `${e.id}-putdown`,
        dayId: e.dayId,
        eventKey: `${e.eventKey}_putdown`,
        type: "putdown",
        label: `Start putting down for ${e.label}`,
        startTime: addMinutes(e.startTime, -lead),
        endTime: e.startTime,
        ...(e.owner !== undefined ? { owner: e.owner } : {}),
        source: "projected",
        status: "projected",
      }),
    );
  }
  return [...events, ...additions].sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));
}
