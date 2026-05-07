import type { Day, Event, Settings } from "./types";
import { makeEvent } from "./types";
import { parseTime } from "./time";

export function mergePumpsAndExtras(
  existing: Event[],
  actuals: Event[],
  settings: Settings,
  day: Day,
): Event[] {
  const out: Event[] = [...existing];
  const actualPumpsByTime = new Map<string, Event>();
  for (const a of actuals) {
    if (a.type === "pump") actualPumpsByTime.set(a.eventKey, a);
  }
  const existingPumpKeys = new Set(
    existing.filter((e) => e.type === "pump").map((e) => e.eventKey),
  );

  // The first pump of the day almost always happens at wake time, so anchor
  // the earliest scheduled pump to day.wakeTime. Remaining scheduled times
  // stay as configured. User can still edit/override after the fact.
  const sortedTimes = [...settings.pumpTimes].sort((a, b) => parseTime(a) - parseTime(b));
  const pumpTimes =
    sortedTimes.length > 0 && day.wakeTime ? [day.wakeTime, ...sortedTimes.slice(1)] : sortedTimes;

  for (const time of pumpTimes) {
    const key = `pump_${time}`;
    if (existingPumpKeys.has(key)) continue;
    const actual = actualPumpsByTime.get(key);
    if (actual) {
      out.push(actual);
    } else {
      out.push(
        makeEvent({
          id: `proj-${day.id}-pump-${time}`,
          dayId: day.id,
          eventKey: key,
          type: "pump",
          label: "Pump",
          startTime: time,
          source: "projected",
          status: "projected",
        }),
      );
    }
  }

  for (const a of actuals) {
    if (a.type === "extra") out.push(a);
  }

  return out.sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));
}
